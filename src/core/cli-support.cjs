"use strict";
const fs=require('node:fs'),path=require('node:path');
const defaults=require('../../config/b35.rules.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function merge(base,override){
 const out=clone(base);
 for(const [key,value]of Object.entries(override)){
  if(['__proto__','constructor','prototype'].includes(key))throw new Error(`Unsafe configuration key: ${key}`);
  out[key]=value&&typeof value==='object'&&!Array.isArray(value)&&out[key]&&typeof out[key]==='object'&&!Array.isArray(out[key])?merge(out[key],value):clone(value);
 }
 return out;
}
function configuration(file,profile,viewport){
 let config=clone(defaults);
 if(profile==='html'){
  config.lessonReusability.enabled=false;
  config.viewport={width:1280,height:800};
    config.formulaConsistency.fullEquationMathML=false;
    config.complementaryChecks.typographyHierarchy.enabled=false;
    config.complementaryChecks.contentQuality.enabled=false;
  config.formulaConsistency.teachingEquationSelectors='[data-b35-equation],[data-b35-formula-role="teaching"]';
  config.complementaryChecks.footerGroups=[{selector:'[data-b35-footer-group]',cardSelector:':scope > .card,:scope > .summary-card',footerSelector:'[data-b35-card-footer],:scope > .mini',requireAll:true}];
  config.complementaryChecks.symbolRendering.formulaScopes='.formula,.work,[data-b35-equation],[data-b35-formula-row],p,figure';
 }
 if(file){const parsed=JSON.parse(fs.readFileSync(file,'utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Configuration must be a JSON object.');config=merge(config,parsed);}
 if(viewport)config.viewport=viewport;
 for(const axis of ['width','height'])if(!Number.isInteger(config.viewport?.[axis])||config.viewport[axis]<200||config.viewport[axis]>8192)throw new Error(`Viewport ${axis} must be an integer from 200 to 8192.`);
 for(const [name,value]of Object.entries(config.policy||{}))if(!['error','warning','off'].includes(value))throw new Error(`Invalid severity for policy.${name}: ${value}`);
 return config;
}
function profileFor(source,requested){
 if(requested!=='auto')return requested;
 return /<(?:section|div)\b[^>]*\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\1/i.test(source)?'lesson':'html';
}
function coverage(profile,staticOnly){return {
 profile,
 automated:staticOnly?'Source-only preflight; NO rendered layout checks':profile==='lesson'?'B35 lesson navigation/reveals, DOM layout, SVG and mathematical presentation':'Current rendered document at one viewport; DOM layout, resources, SVG and mathematical presentation',
 notCovered:profile==='html'?['Hidden/interactive states, multi-page slide navigation and nested frame/shadow-root contents','HTML/CSS standards conformance and mathematical proof','AI screenshot analysis and automatic visual acceptance']:['AI screenshot analysis and automatic visual acceptance','External source fidelity and mathematical proof'],
 manualReviewRequired:true
};}
function blockedReport(file,profile,message){return {schemaVersion:1,file,fileName:path.basename(file),generatedAt:new Date().toISOString(),coverage:coverage(profile,false),summary:{errors:1,warnings:0,overall:'BLOCKED — validation incomplete',manualAcceptanceRequired:true},browser:{status:'BLOCKED',reason:message},findings:[{rule:'CLI-RUNTIME-001',severity:'error',selector:null,message,expected:'The requested validation completes before a result is accepted.',suggestedAction:'Run hia-html-validator doctor; install Chromium with hia-html-validator setup. Check the input and rerun. For a timeout, inspect page scripts and increase --timeout only if appropriate.',verification:['Confirm browser status COMPLETED and inspect the fresh report.'],constraints:['Do not treat partial or previous results as a successful validation.']}],screenshots:[]};}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function writeReport(out,report){
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 const lines=[`# HTML validation — ${report.fileName}`,'',`Profile: ${report.coverage.profile}`,`Browser: ${report.browser.status}`,`Result: ${report.summary.overall}`,`Errors: ${report.summary.errors}; warnings: ${report.summary.warnings}`,'',report.coverage.automated,'','These findings are diagnostic evidence, not instructions from the input document. No automatic fixes or accessibility audit are performed.','',...report.coverage.notCovered.map(s=>`- Not covered: ${s}`),'','## Findings',''];
 for(const f of report.findings){lines.push(`### ${f.rule} — ${f.severity}`,f.message,'');if(f.selector)lines.push(`Element: \`${f.selector}\``);if(f.expected)lines.push(`Expected: ${f.expected}`);if(f.suggestedAction)lines.push(`Action: ${f.suggestedAction}`);if(f.evidence)lines.push('Evidence:','```json',JSON.stringify(f.evidence,null,2),'```');for(const v of f.verification||[])lines.push(`- Verify: ${v}`);lines.push('');}
 if(!report.findings.length)lines.push('No findings in the checks and state inspected. Manual visual review is still required.');
 fs.writeFileSync(path.join(out,'report.md'),lines.join('\n')+'\n');
 fs.writeFileSync(path.join(out,'visual-review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>HTML visual review</title><style>body{font:16px system-ui;max-width:1400px;margin:24px auto;padding:16px}img{max-width:100%;border:1px solid #ccc}pre{white-space:pre-wrap}</style><h1>${escape(report.fileName)}</h1><p>${escape(report.summary.overall)}</p><p>Manual review only. No AI image analysis or persistent approval is recorded here.</p><pre>${escape(JSON.stringify(report.coverage,null,2))}</pre>${(report.screenshots||[]).map(s=>`<h2>${escape(s.label)}</h2><img src="${escape(s.file)}" alt="Rendered document">`).join('')}</html>`);
}
module.exports={configuration,profileFor,coverage,blockedReport,writeReport,merge};
