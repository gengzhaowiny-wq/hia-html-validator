"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {parse,enumerate,playwrightCli}=require('../src/cli/index.cjs'),{configuration,profileFor,merge}=require('../src/core/cli-support.cjs'),{sourceChecks}=require('../src/validators/html.cjs');
const pkg=require('../package.json');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'b35 cli test ')),tests=[];
function test(name,fn){fn();tests.push(name);}
const cli=path.join(__dirname,'../bin/hia-html-validator.cjs');
function command(args){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:30000});if(r.error)throw r.error;return r;}
function fixture(name,body){const file=path.join(temporary,name);fs.writeFileSync(file,body);return file;}
const doc=body=>`<!doctype html><html lang="en"><meta charset="utf-8"><title>CLI fixture</title><body>${body}</body></html>`;
try{
 test('project identity and compatibility commands are consistent',()=>{assert.equal(pkg.name,'hia-html-validator');for(const name of ['hia-html-validator','html-validate-b35','b35-validate'])assert.equal(pkg.bin[name],'bin/hia-html-validator.cjs');assert.ok(command(['--help']).stdout.startsWith(`hia-html-validator ${pkg.version}`));});
 test('help parses',()=>assert.equal(parse(['--help']).help,true));
 test('missing option value rejects',()=>assert.throws(()=>parse(['x.html','--out']),/Missing value/));
 test('unknown flag rejects',()=>assert.throws(()=>parse(['--typo']),/Unknown/));
 test('invalid viewport rejects',()=>assert.throws(()=>parse(['--viewport','wide']),/WIDTH/));
 test('invalid profile rejects',()=>assert.throws(()=>parse(['--profile','magic']),/profile/));
 test('invalid timeout rejects',()=>assert.throws(()=>parse(['--timeout','0']),/timeout/));
 test('double dash preserves dash filename',()=>assert.deepEqual(parse(['--','-lesson.html']).files,['-lesson.html']));
 test('auto lesson detection uses actual markup',()=>assert.equal(profileFor(doc('<section class="slide">Hi</section>'),'auto'),'lesson'));
 test('ordinary HTML gets general profile',()=>assert.equal(profileFor(doc('<p>Hi</p>'),'auto'),'html'));
 test('explicit HTML mode wins',()=>assert.equal(profileFor('<div class="slide"></div>','html'),'html'));
 test('partial config retains defaults',()=>{const file=fixture('partial.json','{"thresholds":{"formulaMaximumFontSizeRatio":1.5}}');const c=configuration(file,'html');assert.equal(c.thresholds.formulaMaximumFontSizeRatio,1.5);assert.equal(c.policy.formulaTypographySeverity,'warning');assert.equal(c.formulaConsistency.fullEquationMathML,false);});
 test('array config rejects',()=>assert.throws(()=>configuration(fixture('array.json','[]'),'html'),/JSON object/));
 test('invalid severity rejects',()=>assert.throws(()=>configuration(fixture('severity.json','{"policy":{"formulaTypographySeverity":"anything"}}'),'html'),/severity/));
 test('prototype keys reject',()=>assert.throws(()=>merge({},JSON.parse('{"__proto__":{}}')),/Unsafe/));
 test('lesson defaults retain all three checks',()=>{const c=configuration(null,'lesson');assert.equal(c.complementaryChecks.footersEnabled,true);assert.equal(c.complementaryChecks.symbolRendering.enabled,true);assert.equal(c.formulaConsistency.fullEquationMathML,true);});
 test('module/importmap/JSON scripts are not parsed as classic scripts',()=>assert.equal(sourceChecks(doc('<script type="module">export const x=1;</script><script type="application/ld+json">{"x":1}</script>')).length,0));
 test('broken classic JS is caught',()=>assert.ok(sourceChecks(doc('<script>const = ;</script>')).some(f=>f.rule==='HTML-SOURCE-002')));
 test('installed-style command help works without browser',()=>assert.equal(command(['--help']).status,0));
 test('version is reported',()=>assert.equal(command(['--version']).stdout.trim(),pkg.version));
 test('setup resolves the real Playwright CLI despite package export restrictions',()=>{assert.ok(fs.existsSync(playwrightCli()));assert.equal(spawnSync(process.execPath,[playwrightCli(),'install','--help'],{encoding:'utf8'}).status,0);});
 test('missing input exits 2',()=>assert.equal(command([path.join(temporary,'missing.html')]).status,2));
 test('setup invalid arguments do not install',()=>assert.equal(command(['setup','--unknown']).status,2));
 const config=path.join(temporary,'custom.json');
 test('init-config creates editable overrides',()=>{assert.equal(command(['init-config',config]).status,0);assert.equal(JSON.parse(fs.readFileSync(config)).schemaVersion,1);});
 test('init-config refuses overwrite',()=>assert.equal(command(['init-config',config]).status,2));
 const clean=fixture('clean with spaces.html',doc('<h1>Example</h1><p>Normal HTML without a lesson shell.</p>'));
 test('recursive discovery does not discard a project with an unrelated report.json',()=>{const d=path.join(temporary,'project files');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'report.json'),'{}');fs.copyFileSync(clean,path.join(d,'page.html'));assert.deepEqual(enumerate([d],true),[fs.realpathSync(path.join(d,'page.html'))]);});
 test('recursive discovery skips generated report bundles',()=>{const d=path.join(temporary,'report scan'),r=path.join(d,'generated');fs.mkdirSync(r,{recursive:true});for(const n of ['report.json','report.md','visual-review.html'])fs.writeFileSync(path.join(r,n),'fixture');fs.copyFileSync(clean,path.join(d,'real.html'));assert.deepEqual(enumerate([d],true),[fs.realpathSync(path.join(d,'real.html'))]);});
 test('plain HTML runs browser without lesson-shell errors',()=>{const out=path.join(temporary,'clean report');assert.equal(command([clean,'--out',out]).status,0);const r=JSON.parse(fs.readFileSync(path.join(out,'report.json')));assert.equal(r.coverage.profile,'html');assert.equal(r.browser.status,'COMPLETED');assert.equal(r.summary.errors,0);assert.ok(fs.existsSync(path.join(out,'screenshots','document.png')));});
 test('static-only cannot claim rendered validation',()=>{const out=path.join(temporary,'static report');assert.equal(command([clean,'--static-only','--out',out]).status,0);const r=JSON.parse(fs.readFileSync(path.join(out,'report.json')));assert.match(r.summary.overall,/PREFLIGHT/);assert.match(r.coverage.automated,/NO rendered/);});
 const wide=fixture('wide.html',doc('<div style="width:5000px">Overflow</div>'));
 test('real horizontal overflow fails',()=>{const out=path.join(temporary,'wide report');assert.equal(command([wide,'--out',out,'--no-screenshots']).status,1);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'report.json'))).findings.some(f=>f.rule==='HTML-LAYOUT-001'));});
 const clipped=fixture('clipped.html',doc('<div style="height:10px;width:80px;overflow:hidden">This text is much longer than its clipped container.</div>'));
 test('warnings can fail a CI run',()=>assert.equal(command([clipped,'--out',path.join(temporary,'clip report'),'--fail-on-warning','--no-screenshots']).status,1));
 test('general maths retains symbol-review requirement',()=>{const file=fixture('math.html',doc('<p><math><msqrt><mn>2</mn></msqrt></math></p>')),out=path.join(temporary,'math report');command([file,'--out',out,'--no-screenshots']);const r=JSON.parse(fs.readFileSync(path.join(out,'report.json')));assert.ok(r.findings.some(f=>f.rule==='B35-MATH-019'&&f.evidence.visualWeightVerified===false));});
 test('output cannot overwrite the input HTML',()=>{const file=fixture('visual-review.html',doc('<p>Keep me.</p>'));const before=fs.readFileSync(file,'utf8');assert.equal(command([file,'--out',temporary]).status,2);assert.equal(fs.readFileSync(file,'utf8'),before);});
 test('auto B35 mode rejects an incomplete lesson shell',()=>{const file=fixture('unsupported lesson.html',doc('<section class="slide">No nav</section>')),out=path.join(temporary,'unsupported report');assert.equal(command([file,'--static-only','--out',out]).status,1);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'report.json'))).findings.some(f=>f.rule==='B35-SOURCE-001'));});
 test('batch keeps same-basename inputs separate and propagates failure',()=>{const d=path.join(temporary,'nested');fs.mkdirSync(d);const another=path.join(d,'wide.html');fs.copyFileSync(clean,another);const out=path.join(temporary,'batch');assert.equal(command([wide,another,'--out',out,'--no-screenshots']).status,1);const r=JSON.parse(fs.readFileSync(path.join(out,'batch-summary.json')));assert.equal(r.results.length,2);assert.notEqual(r.results[0].report,r.results[1].report);});
 test('offline records failed remote assets and still completes local rendering',()=>{const file=fixture('offline.html',doc('<link rel="stylesheet" href="https://example.invalid/not-loaded.css"><p>Local text</p>')),out=path.join(temporary,'offline report');command([file,'--offline','--out',out,'--no-screenshots']);const r=JSON.parse(fs.readFileSync(path.join(out,'report.json')));assert.equal(r.browser.status,'COMPLETED');assert.ok(r.findings.some(f=>f.rule==='HTML-RESOURCE-002'));});
 console.log(JSON.stringify({passed:tests.length,failed:0,tests},null,2));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
