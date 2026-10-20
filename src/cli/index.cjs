#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {configuration,profileFor,coverage,blockedReport,writeReport}=require('../core/cli-support.cjs');
const pkg=require('../../package.json');
const help=`hia-html-validator ${pkg.version}

Usage: hia-html-validator FILE.html [MORE.html ...] [options]
       hia-html-validator DIRECTORY --recursive [options]
       hia-html-validator setup [--with-deps]
       hia-html-validator doctor
       hia-html-validator init-config [FILE.json]

Options:
  --profile auto|lesson|html  auto selects B35 for .slide lesson markup
  --out DIRECTORY           output directory (batch: a subdirectory per file)
  --config FILE.json        JSON overrides, merged over profile defaults
  --viewport WIDTHxHEIGHT   single viewport, e.g. 1280x800
  --static-only             source preflight only; NOT a visual pass
  --no-screenshots          run browser checks without image capture
  --offline                 block HTTP(S), WebSocket and service-worker access
  --fail-on-warning         exit 1 for warnings as well as errors
  --recursive               include nested .html/.htm files
  --timeout MILLISECONDS    per-file process limit, default 300000
  --help, -h                show help
  --version, -v             show version

Exit: 0 no errors (manual review remains); 1 findings; 2 invalid/incomplete.
Only validate trusted HTML: browser checks execute its JavaScript. --offline
is not an operating-system security sandbox. Reports never auto-fix input.`;
function parse(argv){
 const a={files:[],profile:'auto',timeout:300000,screenshots:true};
 for(let i=0;i<argv.length;i++){
  const v=argv[i];if(v==='--'){a.files.push(...argv.slice(i+1));break;}
  if(['--profile','--out','--config','--viewport','--timeout'].includes(v)){const next=argv[++i];if(!next||next.startsWith('--'))throw new Error(`Missing value for ${v}`);a[v.slice(2)]=next;}
  else if(v==='--no-screenshots')a.screenshots=false;
  else if(['--static-only','--offline','--recursive','--fail-on-warning'].includes(v))a[v.slice(2)]=true;
  else if(v==='--help'||v==='-h')a.help=true;
  else if(v==='--version'||v==='-v')a.version=true;
  else if(v.startsWith('-'))throw new Error(`Unknown option: ${v}`);
  else a.files.push(v);
 }
 if(!['auto','lesson','html'].includes(a.profile))throw new Error('--profile must be auto, lesson or html');
 a.timeout=Number(a.timeout);if(!Number.isInteger(a.timeout)||a.timeout<1000||a.timeout>3600000)throw new Error('--timeout must be 1000–3600000 milliseconds');
 if(a.viewport){const m=/^(\d+)x(\d+)$/.exec(a.viewport);if(!m)throw new Error('--viewport must be WIDTHxHEIGHT');a.viewport={width:Number(m[1]),height:Number(m[2])};}
 return a;
}
function enumerate(inputs,recursive,exclude){
 const results=new Set();
 function visit(file){
  const stat=fs.lstatSync(file);if(stat.isSymbolicLink()){if(fs.statSync(file).isFile()&&/\.html?$/i.test(file))results.add(fs.realpathSync(file));return;}
  if(stat.isDirectory()){
   const absolute=fs.realpathSync(file);if(absolute===path.parse(absolute).root||absolute===os.homedir())throw new Error('Choose a specific HTML folder, not the filesystem root or home folder.');
   for(const item of fs.readdirSync(file,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(item.name.startsWith('.')||item.name==='node_modules')continue;
    const target=path.join(file,item.name);if(exclude&&(target===exclude||target.startsWith(exclude+path.sep)))continue;
    if(item.isDirectory()){const generatedReport=['report.json','report.md','visual-review.html'].every(name=>fs.existsSync(path.join(target,name)));if(recursive&&!generatedReport)visit(target);}
    else if(/\.html?$/i.test(item.name))visit(target);
   }
  }else if(stat.isFile()&&/\.html?$/i.test(file))results.add(fs.realpathSync(file));
  else throw new Error(`Expected a local .html/.htm file or directory: ${file}`);
 }
 for(const input of inputs)visit(path.resolve(input));
 return [...results];
}
function doctor(){
 const result={version:pkg.version,node:process.version,nodeSupported:Number(process.versions.node.split('.')[0])>=20,playwright:null,chromiumInstalled:false};
 try{result.playwright=require('playwright/package.json').version;result.chromiumPath=require('playwright').chromium.executablePath();result.chromiumInstalled=fs.existsSync(result.chromiumPath);}catch(e){result.reason=e.message;}
 console.log(JSON.stringify(result,null,2));if(!result.nodeSupported||!result.chromiumInstalled){console.error('Install Node.js 20+ and run: hia-html-validator setup');process.exitCode=2;}
}
function playwrightCli(){return path.join(path.dirname(require.resolve('playwright/package.json')),'cli.js');}
function main(argv){
 if(argv[0]==='setup'){
  if(argv.slice(1).some(v=>v!=='--with-deps'))throw new Error('Usage: hia-html-validator setup [--with-deps]');
  const args=[playwrightCli(),'install',...(argv.includes('--with-deps')?['--with-deps']:[]),'chromium'];
  const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status===0?0:2;return;
 }
 if(argv[0]==='doctor'){if(argv.length!==1)throw new Error('Usage: hia-html-validator doctor');doctor();return;}
 if(argv[0]==='init-config'){
  if(argv.length>2)throw new Error('Usage: hia-html-validator init-config [FILE.json]');
  const target=path.resolve(argv[1]||'b35.config.json');fs.writeFileSync(target,JSON.stringify({schemaVersion:1,thresholds:{formulaMaximumFontSizeRatio:1.2},policy:{svgAccessibleNameSeverity:'off'}},null,2)+'\n',{flag:'wx'});console.log(`Created ${target}\nUse --config to load these overrides; existing files are never overwritten.`);return;
 }
 const a=parse(argv);if(a.help){console.log(help);return;}if(a.version){console.log(pkg.version);return;}if(!a.files.length)throw new Error(help);
 const explicitOut=a.out?path.resolve(a.out):null;
 const files=enumerate(a.files,a.recursive,explicitOut);if(!files.length)throw new Error('No .html or .htm files found.');
 const batch=files.length>1,outRoot=explicitOut||path.resolve('html-validation');
 if(batch&&a.config&&path.resolve(a.config)===path.join(outRoot,'batch-summary.json'))throw new Error('Batch summary would overwrite the input configuration. Choose another --out.');
 // Validate every input/config/output plan before any generated file is written.
 const jobs=files.map(file=>{
  const source=fs.readFileSync(file,'utf8'),profile=profileFor(source,a.profile),config=configuration(a.config,profile,a.viewport);
  const slug=path.basename(file,path.extname(file)).replace(/[^\p{L}\p{N}_.-]/gu,'-')||'document';
  const key=slug+'-'+crypto.createHash('sha256').update(file).digest('hex').slice(0,8);
  const out=batch?path.join(outRoot,key):explicitOut||path.resolve(slug+'-b35-report');
  const protectedPaths=files.concat(a.config?[fs.realpathSync(a.config)]:[]);
  for(const artifact of ['report.json','report.md','visual-review.html','resolved-config.json','run.json']){
   const target=path.join(out,artifact),resolved=fs.existsSync(target)?fs.realpathSync(target):target;
   if(protectedPaths.includes(resolved))throw new Error(`Output would overwrite an input/configuration: ${target}. Choose another --out.`);
  }
  return {file,profile,config,out};
 });
 let code=0;const results=[];
 for(const job of jobs){
  fs.mkdirSync(job.out,{recursive:true});const resolved=path.join(job.out,'resolved-config.json');fs.writeFileSync(resolved,JSON.stringify(job.config,null,2)+'\n');
  const runner=job.profile==='lesson'?'lesson.cjs':'html.cjs';
  const args=[path.join(__dirname,'../validators',runner),job.file,'--config',resolved,'--out',job.out,...(a['static-only']?['--static-only']:[]),...(!a.screenshots?['--no-screenshots']:[]),...(a.offline?['--offline']:[])];
  console.log(`Validating ${job.file} [${job.profile}]`);
  const child=spawnSync(process.execPath,args,{stdio:'pipe',encoding:'utf8',timeout:a.timeout,maxBuffer:16*1024*1024});
  let report;
  if(child.error||child.signal||child.status===2){
   const message=child.error?.code==='ETIMEDOUT'?`Validation exceeded ${a.timeout}ms; browser coverage is incomplete.`:child.error?.message||child.stderr?.trim()||'Validation could not complete. Run doctor and inspect the input.';
   report=blockedReport(job.file,job.profile,message);writeReport(job.out,report);
  }else{
   report=JSON.parse(fs.readFileSync(path.join(job.out,'report.json'),'utf8'));report.coverage=coverage(job.profile,!!a['static-only']);fs.writeFileSync(path.join(job.out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
  const status=report.browser.status==='BLOCKED'?2:report.summary.errors||(a['fail-on-warning']&&report.summary.warnings)?1:0;
  code=Math.max(code,status);const entry={file:job.file,profile:job.profile,exitCode:status,errors:report.summary.errors,warnings:report.summary.warnings,browser:report.browser.status,report:path.join(job.out,'report.md')};results.push(entry);
  fs.writeFileSync(path.join(job.out,'run.json'),JSON.stringify({version:pkg.version,...entry,coverage:report.coverage},null,2)+'\n');
  console.log(`${status===2?'INCOMPLETE':status===1?'FINDINGS':'CHECKS COMPLETED'}: ${entry.errors} errors, ${entry.warnings} warnings; ${entry.report}`);
 }
 if(batch){fs.mkdirSync(outRoot,{recursive:true});fs.writeFileSync(path.join(outRoot,'batch-summary.json'),JSON.stringify({version:pkg.version,exitCode:code,results},null,2)+'\n');console.log(`Batch summary: ${path.join(outRoot,'batch-summary.json')}`);}
 process.exitCode=code;
}
function run(argv=process.argv.slice(2)){try{main(argv);}catch(error){console.error(`hia-html-validator: ${error.message}`);process.exitCode=2;}}
if(require.main===module)run();
module.exports={parse,enumerate,playwrightCli,run};
