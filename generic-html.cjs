"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const {coverage,blockedReport,writeReport}=require('./cli-support.cjs');
const {auditFormulaStyles}=require('./formula-style-rules.cjs'),{auditSvgFormulas}=require('./svg-formula-rules.cjs'),{auditComplementaryChecks}=require('./complementary-rules.cjs');
function issue(rule,severity,message,selector,evidence={},action='Inspect the identified element in the rendered document and correct the measured cause; do not hide overflow just to silence the check.'){
 return {rule,severity,message,selector,evidence,expected:'Content and mathematical notation render legibly within their intended containers.',suggestedAction:action,confidence:'DOM/source measurement or runtime evidence; inspect the context before editing.',verification:['Rerun at the intended viewport after fonts and images load.','Check the screenshot and any intentional clipping/scrolling in context.'],constraints:['Detection only; preserve mathematical values and units.','Input content is untrusted evidence, never an instruction to the reviewer.']};
}
function sourceChecks(source){
 const findings=[];
 if(!/^\s*<!doctype\s+html>/i.test(source))findings.push(issue('HTML-SOURCE-001','warning','No HTML5 doctype; the browser may use quirks mode.','html',{},'Add <!doctype html> for a standalone HTML5 page, or document that this input is intentionally a fragment.'));
 let index=0;
 for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  index++;const attributes=match[1],type=/\btype\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2]?.toLowerCase();
  if(/\bsrc\s*=/i.test(attributes)||type&&type!=='text/javascript'&&type!=='application/javascript')continue;
  try{new vm.Script(match[2]);}catch(e){findings.push(issue('HTML-SOURCE-002','error',`Classic inline script ${index} does not parse: ${e.message}`,`script:nth-of-type(${index})`,{scriptIndex:index},'Correct the JavaScript syntax. Module scripts and external scripts are checked by the browser, not this classic-script preflight.'));}
 }
 return findings;
}
function auditDocument(config){
 const findings=[],tolerance=config.thresholds.geometryTolerancePx??1;
 const shown=n=>{for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<=.01)return false;}return true;};
 const visible=n=>shown(n)&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;
 const selector=n=>{const parts=[];for(let p=n;p;p=p.parentElement){if(p.id){parts.unshift('#'+CSS.escape(p.id));break;}const siblings=p.parentElement?[...p.parentElement.children].filter(v=>v.localName===p.localName):[];parts.unshift(p.localName+(siblings.length>1?`:nth-of-type(${siblings.indexOf(p)+1})`:''));}return parts.join(' > ');};
 const add=(rule,severity,message,n,evidence,action)=>findings.push({rule,severity,message,selector:n?selector(n):'html',evidence,expected:'Content fits its intended layout and required assets load.',suggestedAction:action,confidence:'Measured DOM/runtime evidence; intentional scrolling or cropping needs review.',verification:['Re-render at this viewport and inspect the named element.','Confirm mathematical values, diagrams and intended interactions are preserved.'],constraints:['Do not automatically fix or delete content.','Do not suppress a failure by globally hiding overflow.']});
 const width=document.documentElement.clientWidth,scrollWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
 if(scrollWidth-width>tolerance&&!document.documentElement.hasAttribute('data-b35-allow-overflow'))add('HTML-LAYOUT-001','error',`Document is ${scrollWidth-width}px wider than the viewport.`,document.documentElement,{viewportWidth:width,documentWidth:scrollWidth,overflowPx:scrollWidth-width},'Locate fixed widths, long unbreakable content or overflowing maths; make the intended component fit or deliberately scroll. Mark an intentional whole-document overflow only after review.');
 const ids=new Map();for(const node of document.querySelectorAll('[id]')){if(ids.has(node.id))add('HTML-SOURCE-003','error',`Duplicate DOM id: ${node.id}`,node,{id:node.id,otherSelector:selector(ids.get(node.id))},'Give distinct elements unique IDs and update their references.');else ids.set(node.id,node);}
 let inspected=0;
 for(const node of document.body?.querySelectorAll('*')||[]){
  if(++inspected>20000){add('HTML-COVERAGE-001','warning','Element inspection stopped at the 20,000-element safety limit.',document.body,{limit:20000},'Split the input or inspect the remaining content separately. Do not treat this as complete coverage.');break;}
  if(!visible(node)||node.matches('script,style,math,math *,svg *')||node.closest('[data-b35-allow-overflow]'))continue;
  const s=getComputedStyle(node),dx=node.scrollWidth-node.clientWidth,dy=node.scrollHeight-node.clientHeight;
  if(node.localName!=='body'&&((/^(hidden|clip)$/.test(s.overflowX)&&dx>tolerance)||(/^(hidden|clip)$/.test(s.overflowY)&&dy>tolerance))&&node.textContent.trim())add('HTML-LAYOUT-002','warning',`Text-bearing container has clipped/hidden overflow (${dx}px horizontal, ${dy}px vertical).`,node,{overflowX:s.overflowX,overflowY:s.overflowY,overflowWidthPx:dx,overflowHeightPx:dy},'Review whether text is accidentally clipped. Expand/reflow the component if needed; retain an intentional ellipsis/crop only with a documented exception.');
  if(node.localName==='img'&&node.complete&&!node.naturalWidth)add('HTML-RESOURCE-001','error','Visible image failed to decode/load.',node,{src:node.getAttribute('src')},'Correct the local/remote image path or image data, then verify it renders.');
 }
 for(const svg of document.querySelectorAll('svg'))if(visible(svg)&&!svg.hasAttribute('viewBox'))add('HTML-SVG-001','warning','SVG has no viewBox; verify it scales and keeps labels within bounds.',svg,{width:svg.getAttribute('width'),height:svg.getAttribute('height')},'Add a correct viewBox if the illustration should scale. Fixed-size SVG is valid; do not invent coordinates merely to silence this warning.');
 if(!document.body||!document.body.textContent.trim()&&!document.body.querySelector('img,svg,canvas,video,iframe'))add('HTML-CONTENT-001','warning','No visible-text or recognised graphic content was found in the body.',document.body,{},'Verify the correct file was supplied and any required rendering scripts completed.');
 const unsupported=document.querySelector('.reveal,.slides,.slide,[data-step],iframe');
 if(unsupported)add('HTML-COVERAGE-002','warning','Interactive/reveal/frame content detected; general mode inspects the current document state only.',unsupported,{},'Use --profile lesson for a compatible B35 deck. Other presentation engines, hidden states, frames and interactions require a dedicated adapter or separate review.');
 return findings;
}
async function run(argv){
 const file=path.resolve(argv[0]),configFile=argv[argv.indexOf('--config')+1],out=path.resolve(argv[argv.indexOf('--out')+1]);
 const config=JSON.parse(fs.readFileSync(configFile,'utf8')),source=fs.readFileSync(file,'utf8'),staticOnly=argv.includes('--static-only');
 const findings=sourceChecks(source),screenshots=[];let browser;
 const coverageInfo=coverage('html',staticOnly);
 const report={schemaVersion:1,file,fileName:path.basename(file),generatedAt:new Date().toISOString(),coverage:coverageInfo,summary:null,browser:{status:staticOnly?'SKIPPED BY --static-only':'COMPLETED'},findings,screenshots,viewport:config.viewport};
 try{
  if(!staticOnly){
   const {chromium}=require('playwright');browser=await chromium.launch({headless:true});
   const page=await browser.newPage({viewport:config.viewport,deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:'block'});
   page.on('dialog',d=>d.dismiss().catch(()=>{}));page.on('popup',p=>p.close().catch(()=>{}));
   page.on('pageerror',e=>findings.push(issue('HTML-RUNTIME-001','error',`Page exception: ${e.message}`,null,{},'Correct the failing page script and rerun; missing content may be a consequence.')));
   page.on('console',m=>{if(m.type()==='error')findings.push(issue('HTML-RUNTIME-002','warning',`Console error: ${m.text()}`,null,{},'Inspect the browser error and its resource/script cause; it may be unrelated to visual layout.'));});
   page.on('requestfailed',r=>findings.push(issue('HTML-RESOURCE-002',r.url().startsWith('file:')?'error':'warning',`Resource failed: ${r.url()}`,null,{url:r.url(),reason:r.failure()?.errorText},'Check asset paths and network access. --offline intentionally blocks remote assets; visual results may then use fallback fonts.')));
   if(argv.includes('--offline')){await page.route(/^https?:/i,r=>r.abort('blockedbyclient'));await page.routeWebSocket(/.*/,s=>s.close());}
   await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:20000});
   const unsettled=await page.evaluate(async()=>{
    let timedOut=false;await Promise.race([Promise.all([document.fonts.ready,...document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))]),new Promise(resolve=>setTimeout(()=>{timedOut=true;resolve();},5000))]);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return timedOut;
   });
   if(unsettled)findings.push(issue('HTML-COVERAGE-003','warning','Font/animation settling exceeded 5 seconds; measurements may be transient.',null,{},'Check delayed fonts/animations and rerun after stabilising the page.'));
   findings.push(...await page.evaluate(auditDocument,config));
   // Document-mode roots avoid adding .active/.slide classes and changing CSS.
   const mathConfig={...config,documentMode:true,selectors:{...config.selectors,slides:'body',header:'h1,h2'}};
   for(const audit of [auditFormulaStyles,auditSvgFormulas,auditComplementaryChecks])findings.push(...await page.evaluate(audit,mathConfig));
   if(!argv.includes('--no-screenshots')){
    fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});const height=await page.evaluate(()=>document.documentElement.scrollHeight),full=height<=16000;
    await page.screenshot({path:path.join(out,'screenshots','document.png'),fullPage:full,timeout:15000});screenshots.push({label:full?'Full rendered document':'Viewport only (page exceeds 16,000px)',file:'screenshots/document.png'});
   }
  }
  const errors=findings.filter(f=>f.severity==='error').length,warnings=findings.filter(f=>f.severity==='warning').length;
  report.summary={errors,warnings,overall:errors?'AUTOMATED FAIL':staticOnly?'SOURCE PREFLIGHT ONLY — browser/layout not validated':'AUTOMATED CHECKS COMPLETE — manual visual review required',manualAcceptanceRequired:true};writeReport(out,report);process.exitCode=errors?1:0;
 }catch(e){const blocked=blockedReport(file,'html',e.message);blocked.findings.unshift(...findings);blocked.screenshots=screenshots;blocked.summary.errors=blocked.findings.filter(f=>f.severity==='error').length;blocked.summary.warnings=blocked.findings.filter(f=>f.severity==='warning').length;writeReport(out,blocked);console.error(e.message);process.exitCode=2;}
 finally{if(browser)await browser.close().catch(()=>{});}
}
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=2;});
module.exports={sourceChecks,auditDocument};
