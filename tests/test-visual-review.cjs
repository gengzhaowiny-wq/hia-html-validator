"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright");
const {auditVisualReview}=require("../src/rules/visual-review-rules.cjs");
const config=require("../config/b35.rules.json");
const wrap=(html,css="")=>`<!doctype html><html><head><style>body{margin:0;font:20px Arial}.slide{width:960px;height:540px}.three{display:flex;gap:12px}.card{width:260px;padding:12px;display:flex;flex-direction:column;gap:8px}h3,p{margin:0}.formula{font:24px Arial}math{font:inherit}${css}</style></head><body><section class="slide active" id="fixture"><div class="hdr">Visual review regressions</div>${html}</section></body></html>`;
const cards=(second="",first="")=>`<div class="three"><div class="card"><h3>First</h3><div class="formula" ${first}>2 + 2 = 4</div><div class="note">Example</div></div><div class="card"><h3>Second</h3><div class="formula" ${second}>3 + 3 = 6</div><div class="note">Example</div></div></div>`;
const nested=(attrs="",childWidth=100,childHeight=50)=>`<svg width="440" height="220" viewBox="0 0 440 220"><rect id="whole" x="10" y="10" width="200" height="100" fill="cyan"/><rect id="part" x="10" y="10" width="${childWidth}" height="${childHeight}" fill="purple" ${attrs}/><text x="30" y="40" font-size="14" fill="white">50% are boys</text></svg>`;
const declared='data-b35-percent-of="#whole" data-b35-percent="50"';
const labelFixture=(connector="",labelAttrs='data-b35-label-for="#region"',position="200")=>`<svg width="420" height="200"><rect id="region" x="10" y="20" width="80" height="70" fill="purple"/><text id="label" x="${position}" y="55" ${labelAttrs}>25% of boys</text>${connector}</svg>`;
async function main(){
  const browser=await chromium.launch(),results=[];
  try{
    const page=await browser.newPage({viewport:config.viewport});
    const has=(items,kind)=>items.some(item=>item.evidence.kind===kind);
    const none=rule=>items=>assert.equal(items.some(item=>item.rule===rule),false);
    async function check(name,html,verify,options=config){
      await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
      const findings=await page.evaluate(auditVisualReview,options);verify(findings);results.push({name,passed:true,findings});
    }
    await check("one-line equation passes",wrap('<div class="formula">x + 2 = 4</div>'),none("B35-MATH-015"));
    await check("soft-wrapped equation warns",wrap('<div class="formula" style="width:130px">discount amount = rate × original price</div>'),items=>assert.ok(has(items,"equation-soft-wrap")));
    await check("intentional BR equation rows pass",wrap('<div class="formula" style="width:200px">x + 2<br>= 4</div>'),none("B35-MATH-015"));
    await check("intentional block equation rows pass",wrap('<div class="formula"><div>x + 2</div><div>= 4</div></div>'),none("B35-MATH-015"));
    await check("wrap exemption is honoured",wrap('<div data-b35-allow-equation-wrap class="formula" style="width:100px">amount = rate × original price</div>'),none("B35-MATH-015"));
    await check("hidden wrapped equation is ignored",wrap('<div class="formula" style="visibility:hidden;width:100px">amount = rate × original price</div>'),none("B35-MATH-015"));
    await check("ordinary prose is not an equation",wrap('<div class="work" style="width:100px">Explain the meaning of each percentage.</div>'),none("B35-MATH-015"));
    await check("fraction script layout is not wrapping",wrap('<div class="formula"><math displaystyle="true"><mrow><mfrac><mn>1</mn><mn>7</mn></mfrac><mo>=</mo><mn>0.142857</mn></mrow></math></div>'),none("B35-MATH-015"));
    await check("aligned comparison cards pass",wrap(cards()),none("B35-LAYOUT-001"));
    await check("card formula position mismatch warns",wrap(cards('style="margin-top:35px"')),items=>assert.ok(has(items,"card-role-alignment")));
    await check("card formula font mismatch warns",wrap(cards('style="font-family:Georgia"')),items=>assert.ok(has(items,"card-formula-typography")));
    await check("card formula size mismatch warns",wrap(cards('style="font-size:34px"')),items=>assert.ok(has(items,"card-formula-typography")));
    await check("intentional card variation is exempt",wrap(cards('style="margin-top:35px"').replace('class="three"','class="three" data-b35-allow-card-variation')),none("B35-LAYOUT-001"));
    await check("vertically stacked cards are excluded",wrap(cards('style="margin-top:35px"'),'.three{flex-direction:column}'),none("B35-LAYOUT-001"));
    const required=structuredClone(config);required.visualReview.comparisonGroups=[{selector:'.three',requiredRoles:['example'],roles:{formula:'.formula',example:'.note'}}];
    await check("missing declared card role warns",wrap(cards().replace('<div class="note">Example</div>','')),items=>assert.ok(has(items,"missing-card-role")),required);
    await check("normalised card alignment handles scale",wrap(cards(),'#fixture{transform:scale(.7);transform-origin:0 0}'),none("B35-LAYOUT-001"));
    await check("correct declared area proportion passes",wrap(nested(declared,100,100)),none("B35-DIAGRAM-002"));
    await check("wrong declared area proportion fails",wrap(nested(declared)),items=>assert.ok(items.some(item=>item.evidence.kind==="nested-percentage-mismatch"&&item.severity==="error")));
    await check("explicit width interpretation is allowed",wrap(nested(declared+' data-b35-measure="width"')),none("B35-DIAGRAM-002"));
    await check("unannotated area ambiguity only warns",wrap(nested()),items=>{assert.ok(has(items,"nested-percentage-mismatch"));assert.equal(items.some(item=>item.severity==="error"),false);});
    await check("hidden nested region is ignored",wrap(nested(declared+' style="visibility:hidden"')),none("B35-DIAGRAM-002"));
    await check("nested model exemption is honoured",wrap(nested(declared).replace('<svg ','<svg data-b35-ignore-nested-diagram ')),none("B35-DIAGRAM-002"));
    await check("invalid percentage fails clearly",wrap(nested('data-b35-percent-of="#whole" data-b35-percent="abc"')),items=>assert.ok(has(items,"invalid-nested-model")));
    await check("empty percentage is not interpreted as zero",wrap(nested('data-b35-percent-of="#whole" data-b35-percent=""')),items=>assert.ok(has(items,"invalid-nested-model")));
    await check("missing declared nested target fails",wrap(nested('data-b35-percent-of="#missing" data-b35-percent="50"')),items=>assert.ok(has(items,"invalid-nested-model")));
    await check("empty nested target reports instead of crashing",wrap(nested('data-b35-percent-of="" data-b35-percent="50"')),items=>assert.ok(has(items,"invalid-nested-model")));
    await check("invalid nested selector reports instead of crashing",wrap(nested('data-b35-percent-of="[" data-b35-percent="50"')),items=>assert.ok(has(items,"invalid-nested-model")));
    await check("nested child outside parent fails",wrap(nested(declared,250,100)),items=>assert.ok(has(items,"nested-region-outside")));
    await check("translated scaled rectangles pass",wrap(nested(declared,100,100).replace('<rect id="whole"','<g transform="translate(20 20) scale(.8)"><rect id="whole"').replace('</svg>','</g></svg>')),none("B35-DIAGRAM-002"));
    await check("rotated rectangle is marked unsupported",wrap(nested(declared,100,100).replace('id="part"','id="part" transform="rotate(10 20 20)"')),items=>assert.ok(has(items,"unsupported-nested-geometry")));
    const sidecar=structuredClone(config);sidecar.visualReview.nestedPercentages=[{selector:'svg',parentSelector:'#whole',childSelector:'#part',percentage:50,metric:'width'}];
    await check("nested contract can be supplied without editing HTML",wrap(nested()),none("B35-DIAGRAM-002"),sidecar);
    await check("nearby diagram label passes",wrap(labelFixture('',undefined,'95')),none("B35-DIAGRAM-003"));
    await check("detached diagram label warns",wrap(labelFixture()),items=>assert.ok(has(items,"detached-diagram-label")));
    await check("horizontal connector is recognised",wrap(labelFixture('<line x1="90" y1="50" x2="200" y2="50" stroke="black"/>')),none("B35-DIAGRAM-003"));
    await check("path connector is recognised",wrap(labelFixture('<path id="callout" d="M90 50 H200" stroke="black"/>','data-b35-label-for="#region" data-b35-connector="#callout"')),none("B35-DIAGRAM-003"));
    await check("unrelated connector does not excuse label",wrap(labelFixture('<line x1="90" y1="130" x2="200" y2="130" stroke="black"/>')),items=>assert.ok(has(items,"detached-diagram-label")));
    await check("unpainted connector does not excuse label",wrap(labelFixture('<line x1="90" y1="50" x2="200" y2="50"/>')),items=>assert.ok(has(items,"detached-diagram-label")));
    await check("transparent connector does not excuse label",wrap(labelFixture('<line x1="90" y1="50" x2="200" y2="50" stroke="black" stroke-opacity="0"/>')),items=>assert.ok(has(items,"detached-diagram-label")));
    await check("invalid connector selector reports instead of crashing",wrap(labelFixture('','data-b35-label-for="#region" data-b35-connector="["')),items=>assert.ok(has(items,"invalid-label-connector")));
    await check("missing label target warns",wrap(labelFixture('','data-b35-label-for="#missing"')),items=>assert.ok(has(items,"missing-label-target")));
    await check("empty label target reports instead of crashing",wrap(labelFixture('','data-b35-label-for=""')),items=>assert.ok(has(items,"missing-label-target")));
    await check("intentional detached label is exempt",wrap(labelFixture('','data-b35-label-for="#region" data-b35-allow-detached-label')),none("B35-DIAGRAM-003"));
    const content=(premise,answer,attrs='')=>`<div class="visual-card">${premise}</div><div class="step-solution final" ${attrs}>${answer}</div>`;
    await check("new subgroup in answer warns",wrap(content('50% are boys.','12.5% are boys with blue eyes.')),items=>assert.ok(has(items,"premise-answer-concept")));
    await check("stated subgroup passes",wrap(content('25% of the boys have blue eyes.','12.5% are boys with blue eyes.')),none("B35-CONTENT-001"));
    await check("configured spelling aliases are accepted",wrap(content('Find the blue-eyed subgroup.','12.5% have blue eyes.')),none("B35-CONTENT-001"));
    await check("hidden answer is ignored",wrap(content('50% are boys.','12.5% have blue eyes.','style="visibility:hidden"')),none("B35-CONTENT-001"));
    await check("answer text cannot satisfy its own premise",wrap('<div class="visual-card"><div class="step-solution final">12.5% have blue eyes.</div></div>'),items=>assert.ok(has(items,"premise-answer-concept")));
    await check("unrelated word is not a concept match",wrap(content('Count the berries.','The blueberries are ripe.')),none("B35-CONTENT-001"));
    await check("declared premise concept markers pass",wrap('<div data-b35-premise-concepts="blue-eyes">Given subgroup</div>'+content('Find the percentage.','12.5% have blue eyes.')),none("B35-CONTENT-001"));
    await check("undefined required concept warns",wrap(content('Find the subgroup.','Answer','data-b35-requires-concepts="red-counters"')),items=>assert.ok(has(items,"undefined-required-concept")));
    await check("intentional new concept is exempt",wrap(content('50% are boys.','12.5% have blue eyes.','data-b35-allow-new-concepts')),none("B35-CONTENT-001"));
    const vocabulary=structuredClone(config);vocabulary.visualReview.premiseConcepts=[{id:'red-counters',terms:['red counters']}];
    await check("new vocabulary can be configured",wrap(content('There are counters.','Six are red counters.')),items=>assert.ok(has(items,"premise-answer-concept")),vocabulary);
    const context=structuredClone(config);context.visualReview.premiseAnswerChecks=[{selector:'.slide',contextSelectors:'.context'}];
    await check("selected context can supply the premise",wrap('<aside class="context">The subgroup has blue eyes.</aside>'+content('Find the percentage.','12.5% have blue eyes.')),none("B35-CONTENT-001"),context);
    await check("crowded teaching blocks warn",wrap('<div data-b35-spacing-group><div style="height:40px">First</div><div>Second</div></div>'),items=>assert.ok(has(items,"teaching-block-crowding")));
    await check("spaced teaching blocks pass",wrap('<div data-b35-spacing-group style="display:flex;flex-direction:column;gap:8px"><div>First</div><div>Second</div></div>'),none("B35-COMPOSITION-002"));
    await check("intentional crowding is exempt",wrap('<div data-b35-spacing-group data-b35-allow-crowding><div>First</div><div>Second</div></div>'),none("B35-COMPOSITION-002"));
    await check("density imbalance warns",wrap('<div data-b35-balance style="display:flex"><div style="width:300px;height:350px">'+('A line of dense teaching content.<br>'.repeat(9))+'</div><div style="width:300px;height:350px">Short</div></div>'),items=>assert.ok(has(items,"panel-density-imbalance")));
    await check("balanced related panels pass",wrap('<div data-b35-balance style="display:flex"><div style="width:300px;height:350px">Same content</div><div style="width:300px;height:350px">Same content</div></div>'),none("B35-COMPOSITION-002"));
    await check("intermediate reveal does not fail composition",wrap('<span id="step">Step 0 / 2</span><div data-b35-spacing-group><div>First</div><div>Second</div></div>'),none("B35-COMPOSITION-002"));
    async function lessonCase(file,id,name,verify){
      await page.goto(pathToFileURL(path.resolve(file)).href,{timeout:15000});await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(id=>{let guard=0;while(document.querySelector('.slide.active')?.id!==id&&guard++<1000)next();},id);
      await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      const findings=await page.evaluate(auditVisualReview,config);verify(findings);results.push({name,passed:true,findings});
    }
    const lessonIndex=process.argv.indexOf('--lesson');
    if(lessonIndex>=0){
      const file=process.argv[lessonIndex+1];
      await lessonCase(file,'s25','actual original page 23 flags subgroup geometry and missing premise',items=>{assert.ok(has(items,'nested-percentage-mismatch'));assert.ok(has(items,'detached-diagram-label'));assert.ok(has(items,'premise-answer-concept'));});
      await lessonCase(file,'s35','actual original page 32 flags automatic equation wrapping',items=>assert.ok(has(items,'equation-soft-wrap')));
    }
    const fixedIndex=process.argv.indexOf('--repaired');
    if(fixedIndex>=0)for(const [id,number]of [['s15',14],['s25',23],['s35',32]])await lessonCase(process.argv[fixedIndex+1],id,`actual repaired page ${number} passes new visual-review rules`,items=>assert.deepEqual(items,[]));
    const outIndex=process.argv.indexOf('--out');
    if(outIndex>=0){const destination=path.resolve(process.argv[outIndex+1]);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify({passed:results.length,failed:0,results},null,2)+'\n');}
    console.log(JSON.stringify({passed:results.length,failed:0,tests:results.map(result=>result.name)},null,2));
  } finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
