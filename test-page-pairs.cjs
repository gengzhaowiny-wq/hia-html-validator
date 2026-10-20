"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright");
const {normalizeQuestion,capturePagePairState,auditAdjacentQuestionPages}=require("./page-pair-rules.cjs");
const config=require("./b35.rules.json");
const results=[];
const question="A worker earns $450 for a 40-hour week. Weekly pay rises by 10%, while hours fall by 10%. What is the new hourly wage?";
function pair(){return [
  {runtimeSlide:50,slideId:"q",header:"Question",step:0,maxStep:0,questions:[{text:question,selector:"#q .prompt"}],answerCount:0,visibleAnswerCount:0,revealCount:0,hiddenRevealCount:0,instructionTexts:[],otherText:"",graphics:[],opaqueContent:false},
  {runtimeSlide:51,slideId:"a",header:"Worked reasoning",step:0,maxStep:4,questions:[{text:question,selector:"#a .prompt"}],answerCount:4,visibleAnswerCount:0,revealCount:4,hiddenRevealCount:4,instructionTexts:[],otherText:"",graphics:[],opaqueContent:false}
];}
function check(name,mutate,expected=0,options=config){const records=pair();mutate(records);const findings=auditAdjacentQuestionPages(records,options);assert.equal(findings.length,expected,name);results.push({name,passed:true,findings});}
check("matching adjacent question/hidden-work pages warn",()=>{},1);
check("different number does not match",r=>{r[1].questions[0].text=question.replace("450","460");});
check("different units do not match",r=>{r[1].questions[0].text=question.replace("hour","day");});
check("different signs do not match",r=>{r[0].questions[0].text="x + 2 = 4";r[1].questions[0].text="x − 2 = 4";});
check("superscript unit is preserved",r=>{r[0].questions[0].text="100 cm²";r[1].questions[0].text="100 cm2";});
check("variable case is preserved",r=>{r[0].questions[0].text="Find X";r[1].questions[0].text="Find x";});
check("whitespace-only differences match",r=>{r[1].questions[0].text="  "+question.replaceAll(" ","  \n ")+" ";},1);
check("visible answer prevents warning",r=>{r[1].visibleAnswerCount=1;});
check("visible reveal prevents warning",r=>{r[1].hiddenRevealCount=3;});
check("no reveal sequence prevents warning",r=>{r[1].maxStep=0;});
check("hints alone are not worked answers",r=>{r[1].answerCount=0;});
check("first page already has an answer",r=>{r[0].answerCount=1;});
check("first page already has a reveal sequence",r=>{r[0].maxStep=1;r[0].revealCount=1;});
check("non-adjacent runtime pages are excluded",r=>{r[1].runtimeSlide=52;});
check("later reveal state is excluded",r=>{r[1].step=1;});
check("additional first-page question prevents warning",r=>{r[0].questions.push({text:"A second task",selector:".extra"});});
check("distinct first-page instruction prevents warning",r=>{r[0].instructionTexts=["Draw a rate table before calculating."];});
check("shared instruction is not distinct",r=>{r[0].instructionTexts=["Draw a rate table."];r[1].instructionTexts=["Draw a rate table."];},1);
check("explicit configured boilerplate is recorded",r=>{r[0].instructionTexts=[config.pagePairs.boilerplateTexts[0]];},1);
check("distinct first-page diagram prevents warning",r=>{r[0].graphics=["<svg>unique diagram</svg>"];});
check("identical diagram reference can be shared",r=>{r[0].graphics=["<svg>same diagram</svg>"];r[1].graphics=["<svg>same diagram</svg>"];},1);
check("unclassified unique material prevents warning",r=>{r[0].otherText="An extra condition changes this task.";});
check("opaque first-page media prevents warning",r=>{r[0].opaqueContent=true;});
check("intentional separate-page marker is honoured",r=>{r[0].intentionalSeparate=true;});
const excluded=structuredClone(config);excluded.pagePairs.exemptSlideIds=["q"];
check("configured slide exemption is honoured",()=>{},0,excluded);
const disabled=structuredClone(config);disabled.pagePairs.enabled=false;
check("rule can be disabled",()=>{},0,disabled);
assert.notEqual(normalizeQuestion("cm²"),normalizeQuestion("cm2"));
const specimen=auditAdjacentQuestionPages(pair(),config)[0];
for(const key of ["message","expected","impact","confidence","suggestedAction","verification","constraints","evidence","relatedLocations"])assert.ok(specimen[key],`Missing actionable field: ${key}`);
assert.match(specimen.message,/No automatic merge/);
results.push({name:"warning contains self-contained LLM-actionable guidance",passed:true,findings:[specimen]});

async function main(){
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:config.viewport});
    async function fixture(extra="",questionHtml=question){
      await page.setContent(`<style>.slide{display:none;width:960px;height:540px}.active{display:block}[data-step]{visibility:hidden;opacity:0}</style><section class="slide active" id="q"><div class="hdr">Question</div><div class="body"><p class="prompt">${questionHtml}</p>${extra}</div></section><section class="slide" id="a"><div class="hdr">Worked</div><div class="body"><p class="prompt">${questionHtml}</p><div class="step-solution" data-step="1">First working</div><div class="step-solution" data-step="2">Answer</div></div></section>`);
      const records=[];
      for(const [id,n,max]of [["q",1,0],["a",2,2]]){
        await page.evaluate(id=>{document.querySelectorAll(".slide").forEach(node=>node.classList.toggle("active",node.id===id));},id);
        records.push(await page.evaluate(capturePagePairState,{config,metadata:{runtimeSlide:n,step:0,maxStep:max,header:id}}));
      }
      return records;
    }
    let snapshots=await fixture();
    assert.equal(auditAdjacentQuestionPages(snapshots,config).length,1);
    assert.equal(snapshots[1].hiddenRevealCount,2);
    results.push({name:"browser capture verifies question and hidden working",passed:true});
    snapshots=await fixture('<p>Use the special rate table below.</p>');
    assert.equal(auditAdjacentQuestionPages(snapshots,config).length,0);
    results.push({name:"browser capture protects unclassified unique instruction",passed:true});
    snapshots=await fixture('<svg width="80" height="80"><rect width="50" height="50"/></svg>');
    assert.equal(auditAdjacentQuestionPages(snapshots,config).length,0);
    results.push({name:"browser capture protects unique diagram",passed:true});
    snapshots=await fixture('', 'Find <math aria-label="1 over 7"><mfrac><mn>1</mn><mn>7</mn></mfrac></math>% of 100 cm<sup>2</sup>.');
    assert.match(snapshots[0].questions[0].text,/math\(1 over 7\).*\^\(2\)/);
    assert.equal(auditAdjacentQuestionPages(snapshots,config).length,1);
    results.push({name:"browser capture preserves MathML meaning and superscript units",passed:true});
    await page.setContent('<style>.slide{display:block}</style><section class="slide active" id="q"><div class="body"><p class="prompt">Question</p><p class="hint" style="display:none">Hidden extra</p></div></section>');
    const hidden=await page.evaluate(capturePagePairState,{config,metadata:{runtimeSlide:1,step:0,maxStep:0}});
    assert.deepEqual(hidden.instructionTexts,[]);
    results.push({name:"hidden instruction is not reported as initial content",passed:true});
    const lessonIndex=process.argv.indexOf("--lesson");
    if(lessonIndex>=0){
      await page.goto(pathToFileURL(path.resolve(process.argv[lessonIndex+1])).href);
      await page.evaluate(()=>document.fonts.ready);
      const records=[];
      for(const [id,n,max]of [["s51",50,0],["s51a",51,4],["s53",52,0],["s53a",53,4],["s70",70,0],["s70a",71,4]]){
        // Runtime numbering for s70 is obtained from DOM, not inferred from IDs.
        await page.evaluate(id=>{let guard=0;while(document.querySelector(".slide.active")?.id!==id&&guard++<1000)next();},id);
        await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
        const meta=await page.evaluate(()=>{const slide=document.querySelector(".slide.active"),match=/Step\s+(\d+)\s*\/\s*(\d+)/.exec(document.querySelector("#step").textContent);return {runtimeSlide:[...document.querySelectorAll(".slide")].indexOf(slide)+1,step:Number(match[1]),maxStep:Number(match[2]),header:slide.querySelector(".hdr").textContent};});
        records.push(await page.evaluate(capturePagePairState,{config,metadata:meta}));
      }
      const found=auditAdjacentQuestionPages(records,config);
      assert.ok(found.some(item=>item.runtimeSlide===50&&item.relatedLocations[0].runtimeSlide===51));
      assert.ok(found.some(item=>item.runtimeSlide===52&&item.relatedLocations[0].runtimeSlide===53));
      assert.ok(records.find(record=>record.slideId==="s70").graphics.length>0);
      assert.equal(found.some(item=>item.slide==="s70"),false);
      results.push({name:"actual Chapter 7 pages 50–51 and 52–53 are flagged",passed:true,findings:found});
      results.push({name:"actual unique diagram prevents a pages 70–71 warning",passed:true});
    }
  }finally{await browser.close();}
  const report={passed:results.length,failed:0,results};
  const outIndex=process.argv.indexOf("--out");
  if(outIndex>=0){const destination=path.resolve(process.argv[outIndex+1]);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+"\n");}
  console.log(JSON.stringify({passed:report.passed,failed:0,tests:results.map(result=>result.name)},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
