"use strict";

// Self-contained browser rules. These inspect DOM geometry and bounded text
// contracts; they do not run a vision model or certify teaching intent.
function auditVisualReview(config) {
  const issues = [], settings = config.visualReview || {}, limits = config.thresholds || {};
  const slides = [...document.querySelectorAll(config.selectors.slides)];
  const shown = node => {
    for (let item = node; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= .01) return false;
    }
    return true;
  };
  const visible = node => node && shown(node) && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  const pick = (scope, query) => {
    if(typeof query!=="string"||!query.trim())return null;
    try{return scope.querySelector(query);}catch{return null;}
  };
  const pathFor = node => {
    const parts = [];
    for (let item = node; item && parts.length < 9; item = item.parentElement) {
      if (item.id) { parts.unshift(`#${item.id}`); break; }
      const peers = item.parentElement ? [...item.parentElement.children].filter(peer => peer.localName === item.localName) : [];
      parts.unshift(item.localName + (peers.length > 1 ? `:nth-of-type(${peers.indexOf(item) + 1})` : ""));
    }
    return parts.join(" > ");
  };
  const boxFor = node => {
    const box = node.getBoundingClientRect();
    return {left:box.left, right:box.right, top:box.top, bottom:box.bottom, width:box.width, height:box.height};
  };
  const contains = (outer, inner, tolerance = 0) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance
    && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
  const pointIn = (box, point, tolerance = 0) => point.x >= box.left-tolerance && point.x <= box.right+tolerance && point.y >= box.top-tolerance && point.y <= box.bottom+tolerance;
  const distance = (a,b) => Math.hypot(Math.max(0,a.left-b.right,b.left-a.right),Math.max(0,a.top-b.bottom,b.top-a.bottom));
  const normalize = text => text.toLowerCase().replace(/[‐‑–—-]/g," ").replace(/[^a-z0-9%]+/g," ").trim().replace(/\s+/g," ");
  const hasTerm = (text, term) => (` ${normalize(text)} `).includes(` ${normalize(term)} `);
  const family = node => {
    const value = getComputedStyle(node).fontFamily.split(",")[0].replace(/["']/g,"").trim().toLowerCase();
    return config.formulaConsistency?.fontFamilyAliases?.[value] || value;
  };
  const unionArea = boxes => {
    const xs = [...new Set(boxes.flatMap(box=>[box.left,box.right]))].sort((a,b)=>a-b);
    let result=0;
    for(let i=1;i<xs.length;i++) {
      const spans=boxes.filter(box=>box.left<xs[i]&&box.right>xs[i-1]).map(box=>[box.top,box.bottom]).sort((a,b)=>a[0]-b[0]);
      let end=-Infinity, height=0;
      for(const [a,b] of spans) {height+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
      result+=(xs[i]-xs[i-1])*height;
    }
    return result;
  };
  const contentArea = root => {
    const boundary=boxFor(root), boxes=[];
    const append=rect=>{
      const box={left:Math.max(boundary.left,rect.left),right:Math.min(boundary.right,rect.right),top:Math.max(boundary.top,rect.top),bottom:Math.min(boundary.bottom,rect.bottom)};
      if(box.right>box.left&&box.bottom>box.top) boxes.push(box);
    };
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node=walker.currentNode;
      if(!node.textContent.trim()||!visible(node.parentElement)||node.parentElement.closest("script,style,.hi-wm,[data-b35-ignore-composition]")) continue;
      const range=document.createRange();range.selectNodeContents(node);
      [...range.getClientRects()].forEach(append);
    }
    for(const node of root.querySelectorAll("svg rect,svg path,svg circle,svg ellipse,svg polygon,svg image,img,canvas")) {
      if(!visible(node)||node.closest(".hi-wm,[data-b35-ignore-composition]")) continue;
      const box=boxFor(node),svg=node.closest("svg"),svgBox=svg&&boxFor(svg);
      if(node.localName==="rect"&&svgBox&&box.width*box.height>.95*svgBox.width*svgBox.height&&getComputedStyle(node).stroke==="none") continue;
      append(box);
    }
    return unionArea(boxes)/(boundary.width*boundary.height);
  };

  for(const slide of slides.filter(node=>node.classList.contains("active"))) {
    const scale=slide.offsetWidth ? slide.getBoundingClientRect().width/slide.offsetWidth : 1;
    const emit=(rule,severity,message,node,evidence={})=>{
      if(severity==="off") return;
      issues.push({rule,severity,message,slide:slide.id,runtimeSlide:slides.indexOf(slide)+1,
        header:(slide.querySelector(config.selectors.header)?.textContent||"").trim(),selector:pathFor(node),evidence});
    };
    const review=(rule,message,node,evidence)=>emit(rule,config.policy?.visualReviewSeverity??"warning",message,node,evidence);
    const finalState=()=>{
      const match=/Step\s+(\d+)\s*\/\s*(\d+)/i.exec(document.querySelector("#step")?.textContent||"");
      return !match||Number(match[1])===Number(match[2]);
    };
    const semantic="math,.frac,.katex,mjx-container";

    // LAYOUT-006: lettered tasks need author-defined rows, not accidental
    // soft wrapping at a particular viewport. Ignore algebra and references.
    if(settings.questionPartsEnabled!==false){
      const selector=settings.questionPartSelectors||'.prompt,.practice-question,[data-b35-question],[data-b35-question-parts]';
      for(const root of slide.querySelectorAll(selector)){
        if(!visible(root)||root.parentElement.closest(selector)||root.closest('[data-b35-allow-inline-question-parts]'))continue;
        function rows(node){
          if(node.nodeType===Node.TEXT_NODE){const s=getComputedStyle(node.parentElement);return /^(pre|pre-wrap|pre-line|break-spaces)$/.test(s.whiteSpace)?node.textContent:node.textContent.replace(/\s+/gu,' ');}
          if(node.nodeType!==Node.ELEMENT_NODE||!shown(node)||node.matches('script,style,annotation,annotation-xml'))return '';
          if(node.localName==='br')return '\n';
          if(node.matches(semantic))return ' [math] ';
          const block=/^(block|list-item|flex|grid|table-row|table-cell|table-caption|flow-root)$/.test(getComputedStyle(node).display);
          const content=[...node.childNodes].map(rows).join('');return block?'\n'+content+'\n':content;
        }
        const text=rows(root),markers=[...text.matchAll(/(^|[\s:;,])(\(([a-z])\)|([a-z])\))/gu)].map(m=>({label:m[3]||m[4],offset:m.index+m[1].length,length:m[2].length}));
        const failures=[];
        for(let i=0;i<markers.length;i++){
          if(markers[i].label!=='a')continue;
          const parts=[markers[i]];let j=i+1;
          while(j<markers.length&&markers[j].label.charCodeAt(0)===parts.at(-1).label.charCodeAt(0)+1)parts.push(markers[j++]);
          if(parts.length<2)continue;
          const tasks=parts.map((part,k)=>text.slice(part.offset+part.length,k+1<parts.length?parts[k+1].offset:text.length).trim());
          // '(a), (b)' or 'parts (a) and (b)' are cross-references, not tasks.
          if(tasks.some(task=>!/[\p{L}\p{N}]/u.test(task)||/^(?:and|or|with|to|versus|vs)[\s,;:.]*$/iu.test(task)))continue;
          for(const part of parts){const prefix=text.slice(0,part.offset).split('\n').at(-1);if(prefix.trim())failures.push(part.label);}
          i=j-1;
        }
        if(failures.length){
          review('B35-LAYOUT-006','Lettered question parts must each start on an explicit new line or separate block.',root,
            {kind:'inline-question-subparts',labelsWithoutOwnLine:[...new Set(failures)],textWithExplicitRows:text,source:'DOM BR/block boundaries and whitespace-preserving CSS; natural soft wrapping does not count'});
          const finding=issues.at(-1);
          if(finding?.rule==='B35-LAYOUT-006')Object.assign(finding,{
            expected:'Present the stem once, then start each (a), (b), (c), (d) task on its own line using BRs, block rows or a vertical list.',
            impact:'Inline subquestions are difficult to scan and can wrap into misleading groupings as the viewport or font changes.',
            suggestedAction:'Insert an explicit line break or separate block before each labelled task, retaining all wording, values, units and labels. Recheck the full question and solution at classroom font sizes; use a justified continuation if necessary, not smaller type.',
            confidence:'Consecutive lowercase lettered-task heuristic with DOM/CSS row boundaries, not optical or mathematical certification.',
            verification:['Check every lettered task starts on its own line at the intended viewport.','Revalidate panel bounds, question/solution layout, fonts and reveal order.'],
            constraints:['Detection only; no automatic rewriting, task deletion or forced one-page merge.','MathML algebra and label-only references are excluded; ambiguous prose requires review.','Use data-b35-allow-inline-question-parts only for an explicitly reviewed intentional notation comparison.']});
        }
      }
    }

    // MATH-015: recognise soft wrapping inside a formula segment. Explicit BRs
    // and block rows form intentional segment boundaries, not automatic failures.
    const formulaSelector=settings.formulaSelectors||".formula,.work,[data-b35-formula]";
    for(const root of slide.querySelectorAll(formulaSelector)) {
      if(!visible(root)||root.closest("[data-b35-allow-equation-wrap]")) continue;
      if(root.parentElement.closest(formulaSelector)) continue;
      if(!/[=×÷+−<>≤≥]/.test(root.textContent)&&!root.querySelector(semantic)) continue;
      const segments=[[]];
      const boundary=()=>{if(segments.at(-1).length)segments.push([]);};
      function collect(node) {
        if(node.nodeType===Node.TEXT_NODE) {
          if(!visible(node.parentElement)) return;
          for(const match of node.textContent.matchAll(/\S+/g)) {
            const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
            for(const box of range.getClientRects()) if(box.width&&box.height)segments.at(-1).push({text:match[0],box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,height:box.height}});
          }
          return;
        }
        if(node.nodeType!==Node.ELEMENT_NODE||!shown(node)||node.matches("script,style,annotation,annotation-xml")) return;
        if(node.localName==="br") {boundary();return;}
        if(node!==root&&node.matches(semantic)) {segments.at(-1).push({text:node.getAttribute("aria-label")||node.textContent,box:boxFor(node)});return;}
        const block=node!==root&&["block","flex","grid","table","list-item"].includes(getComputedStyle(node).display);
        if(block) boundary();
        for(const child of node.childNodes)collect(child);
        if(block) boundary();
      }
      if(root.matches(semantic)) continue;
      collect(root);
      const wrapped=[];
      for(const tokens of segments.filter(segment=>segment.length)) {
        const lines=[];
        for(const token of tokens) {
          const center=(token.box.top+token.box.bottom)/2;
          const line=lines.find(item=>item.tokens.some(other=>Math.min(other.box.bottom,token.box.bottom)-Math.max(other.box.top,token.box.top)>.45*Math.min(other.box.height,token.box.height)));
          if(line) {line.tokens.push(token);line.center=(line.center*(line.tokens.length-1)+center)/line.tokens.length;}
          else lines.push({center,height:token.box.height,tokens:[token]});
        }
        lines.sort((a,b)=>a.center-b.center);
        if(lines.length>(limits.equationMaximumSoftLines??1)) wrapped.push(lines.map(line=>({text:line.tokens.map(token=>token.text).join(" "),top:Math.min(...line.tokens.map(token=>token.box.top)),bottom:Math.max(...line.tokens.map(token=>token.box.bottom))})));
      }
      if(wrapped.length) review("B35-MATH-015","Formula soft-wraps across lines; review operator grouping or use explicit equation rows.",root,{kind:"equation-soft-wrap",segments:wrapped,source:"rendered text ranges; review required"});
    }

    // LAYOUT-001: comparable cards in one horizontal row. Unrelated slide
    // headings, vertically stacked practice cards and hidden roles are excluded.
    const comparisonGroups=[];
    const declaredGroups=settings.comparisonGroups||[];
    const groups=new Set([...slide.querySelectorAll(".three,.four,[data-b35-comparison]"),...declaredGroups.flatMap(model=>[...slide.querySelectorAll(model.selector)])]);
    for(const group of groups) {
      if(!visible(group)||group.closest("[data-b35-allow-card-variation]"))continue;
      const model=declaredGroups.find(item=>group.matches(item.selector));
      const cards=[...group.querySelectorAll(model?.cardSelector||":scope > .card,:scope > .summary-card")].filter(visible);
      if(cards.length<2)continue;
      const cardBoxes=cards.map(boxFor);
      if(Math.max(...cardBoxes.map(box=>box.top))-Math.min(...cardBoxes.map(box=>box.top))>(limits.cardAlignmentTolerancePx??8)*scale)continue;
      if(!model&&!group.hasAttribute("data-b35-comparison")&&!cards.every(card=>card.querySelector(".formula,[data-b35-card-formula]")))continue;
      comparisonGroups.push({group,cards});
      const roles=model?.roles||{heading:"h3,[data-b35-card-heading]",formula:".formula,[data-b35-card-formula]",example:".note,[data-b35-card-example]"};
      for(const [role,query]of Object.entries(roles)) {
        const samples=cards.map(card=>{
          const node=[...card.querySelectorAll(query)].find(visible);
          if(!node)return null;
          const box=boxFor(node),cardBox=boxFor(card);
          return {selector:pathFor(node),top:(box.top-cardBox.top)/scale,bottom:(box.bottom-cardBox.top)/scale,left:(box.left-cardBox.left)/scale,
            fontSize:parseFloat(getComputedStyle(node).fontSize),family:family(node)};
        });
        if(finalState()&&(model?.requiredRoles||[]).includes(role)&&samples.some(sample=>!sample)) review("B35-LAYOUT-001",`Comparison card is missing the declared ${role} role.`,group,{kind:"missing-card-role",role,measurements:samples});
        const available=samples.filter(Boolean);
        if(available.length<2)continue;
        const spread=key=>Math.max(...available.map(sample=>sample[key]))-Math.min(...available.map(sample=>sample[key]));
        if(spread("top")>(limits.cardAlignmentTolerancePx??8)||spread("left")>(limits.cardAlignmentTolerancePx??8)
          ||(role==="formula"&&spread("bottom")>(limits.cardFormulaBottomTolerancePx??16)))review("B35-LAYOUT-001",`Matching cards have inconsistent ${role} positions or formula heights.`,group,{kind:"card-role-alignment",role,measurements:available});
        if(role==="formula"&&(new Set(available.map(sample=>sample.family)).size>1||Math.max(...available.map(sample=>sample.fontSize))/Math.min(...available.map(sample=>sample.fontSize))>(limits.formulaMaximumFontSizeRatio??1.2)))review("B35-LAYOUT-001","Matching cards use different formula font families or base sizes.",group,{kind:"card-formula-typography",measurements:available});
      }
    }

    // DIAGRAM-002/003: declared rectangle contracts, with conservative inferred
    // review candidates for labelled nested rectangles. No arbitrary shape math.
    const associations=[],models=[];
    for(const model of settings.nestedPercentages||[])for(const scope of slide.querySelectorAll(model.selector))models.push({...model,scope,source:"declared model"});
    for(const node of slide.querySelectorAll("[data-b35-percent-of]"))models.push({scope:node.closest("svg")||slide,childNode:node,parentSelector:node.getAttribute("data-b35-percent-of"),percentage:node.getAttribute("data-b35-percent"),metric:node.getAttribute("data-b35-measure")||"area",source:"declared model"});
    for(const model of settings.diagramLabels||[])for(const label of slide.querySelectorAll(model.selector))associations.push({...model,label,scope:label.closest("svg")||slide,source:"declared association"});
    for(const label of slide.querySelectorAll("[data-b35-label-for]"))associations.push({label,scope:label.closest("svg")||slide,targetSelector:label.getAttribute("data-b35-label-for"),connectorSelector:label.getAttribute("data-b35-connector")||null,source:"declared association"});
    const declaredChildren=new Set(models.map(model=>model.childNode||pick(model.scope,model.childSelector)).filter(Boolean));
    if(settings.inferNestedPercentages!==false)for(const svg of slide.querySelectorAll("svg")) {
      if(!visible(svg)||svg.closest("[data-b35-ignore-nested-diagram]"))continue;
      const rects=[...svg.querySelectorAll("rect")].filter(node=>visible(node)&&getComputedStyle(node).fill!=="none");
      const labels=[...svg.querySelectorAll("text")].filter(visible).map(label=>{
        const match=/^\s*(\d+(?:\.\d+)?)\s*%\s+(are|is|of|represent(?:s)?)\s+(.+?)\s*$/i.exec(label.textContent);
        return match?{label,percentage:Number(match[1]),verb:match[2].toLowerCase(),group:normalize(match[3]).replace(/^the /,"")}:null;
      }).filter(Boolean);
      const matched=[];
      for(const entry of labels) {
        const labelBox=boxFor(entry.label),point={x:(labelBox.left+labelBox.right)/2,y:(labelBox.top+labelBox.bottom)/2};
        const child=rects.filter(node=>pointIn(boxFor(node),point)).sort((a,b)=>boxFor(a).width*boxFor(a).height-boxFor(b).width*boxFor(b).height)[0];
        const parent=child&&rects.filter(node=>node!==child&&contains(boxFor(node),boxFor(child))&&boxFor(node).width*boxFor(node).height>boxFor(child).width*boxFor(child).height*1.01).sort((a,b)=>boxFor(a).width*boxFor(a).height-boxFor(b).width*boxFor(b).height)[0];
        if(child&&parent&&!declaredChildren.has(child)) {models.push({...entry,scope:svg,childNode:child,parentNode:parent,metric:"area",source:"inferred label; area interpretation requires review"});matched.push({...entry,child,parent});}
      }
      for(const entry of labels.filter(item=>item.verb==="of")) {
        const parents=matched.filter(item=>item.group===entry.group);
        if(parents.length!==1)continue;
        const parent=parents[0].child;
        const candidates=rects.filter(node=>node!==parent&&!matched.some(item=>item.child===node)&&contains(boxFor(parent),boxFor(node))&&boxFor(node).width*boxFor(node).height<boxFor(parent).width*boxFor(parent).height);
        if(candidates.length!==1||declaredChildren.has(candidates[0]))continue;
        const child=candidates[0];
        models.push({...entry,scope:svg,childNode:child,parentNode:parent,metric:"area",source:"inferred subgroup label; requires review"});
        associations.push({label:entry.label,scope:svg,targetNode:child,source:"inferred unique subgroup; requires review"});
      }
    }
    for(const model of models) {
      if(!visible(model.scope)||model.scope.closest("[data-b35-ignore-nested-diagram]"))continue;
      const child=model.childNode||pick(model.scope,model.childSelector),parent=model.parentNode||pick(model.scope,model.parentSelector);
      const declared=model.source==="declared model",severity=declared?(config.policy?.declaredVisualModelSeverity??"error"):(config.policy?.visualReviewSeverity??"warning");
      const raw=String(model.percentage??"").trim(),percentage=Number(raw);
      if(!child||!parent||!raw||!Number.isFinite(percentage)||percentage<0||percentage>100||!["area","width","height"].includes(model.metric||"area")||child===parent) {
        emit("B35-DIAGRAM-002",declared?severity:"warning","Nested-percentage contract has missing targets, an invalid percentage, or an unsupported metric.",model.scope,{kind:"invalid-nested-model",source:model.source,percentage:model.percentage,metric:model.metric});continue;
      }
      if(!visible(child)||!visible(parent)||child.closest("[data-b35-ignore-nested-diagram]"))continue;
      const matrix=node=>node.getScreenCTM?.(),rotated=node=>{const m=matrix(node);return m&&(Math.abs(m.b)>.0001||Math.abs(m.c)>.0001);};
      if(child.localName!=="rect"||parent.localName!=="rect"||rotated(child)||rotated(parent)) {
        review("B35-DIAGRAM-002","Nested model uses non-rectangular or rotated geometry; proportional area cannot be certified.",child,{kind:"unsupported-nested-geometry",source:model.source});continue;
      }
      const a=boxFor(child),b=boxFor(parent),ratios={width:a.width/b.width,height:a.height/b.height,area:a.width*a.height/(b.width*b.height)},metric=model.metric||"area";
      const expected=percentage/100;
      if(!contains(b,a,(limits.diagramGeometryTolerancePx??2)*scale))emit("B35-DIAGRAM-002",severity,"Nested percentage region extends outside its declared parent.",child,{kind:"nested-region-outside",source:model.source,childBox:a,parentBox:b});
      if(Math.abs(ratios[metric]-expected)>(limits.diagramFractionRatioTolerance??.02))emit("B35-DIAGRAM-002",severity,
        `${declared?"Declared":"Inferred"} ${percentage}% subgroup occupies ${(ratios[metric]*100).toFixed(1)}% of the parent by ${metric}.`,child,
        {kind:"nested-percentage-mismatch",source:model.source,metric,expectedRatio:expected,ratios,parentSelector:pathFor(parent),label:model.label?.textContent||null});
    }
    for(const model of associations) {
      if(!visible(model.label)||model.label.closest("[data-b35-allow-detached-label]"))continue;
      const target=model.targetNode||pick(model.scope,model.targetSelector);
      if(!target) {review("B35-DIAGRAM-003","Diagram label references a target that does not exist.",model.label,{kind:"missing-label-target",targetSelector:model.targetSelector});continue;}
      if(!visible(target))continue;
      const labelBox=boxFor(model.label),targetBox=boxFor(target),tolerance=(limits.diagramConnectorTolerancePx??6)*scale;
      let connectors=[];
      try {connectors=[...model.scope.querySelectorAll(model.connectorSelector||"line,polyline,path")].filter(node=>{
        const style=getComputedStyle(node);
        return shown(node)&&style.stroke!=="none"&&Number(style.strokeOpacity)>.01&&!/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(style.stroke);
      });}catch{
        review("B35-DIAGRAM-003","Diagram label has an invalid connector selector.",model.label,{kind:"invalid-label-connector",connectorSelector:model.connectorSelector});
        continue;
      }
      const connected=connectors.some(node=>{
        try {
          if(!node.getTotalLength)return false;
          const length=node.getTotalLength(),matrix=node.getScreenCTM();
          if(!matrix)return false;
          const a=node.getPointAtLength(0).matrixTransform(matrix),b=node.getPointAtLength(length).matrixTransform(matrix);
          return (pointIn(targetBox,a,tolerance)&&pointIn(labelBox,b,tolerance))||(pointIn(targetBox,b,tolerance)&&pointIn(labelBox,a,tolerance));
        } catch {return false;}
      });
      const gap=distance(labelBox,targetBox)/scale;
      const near=gap<=(model.maximumDistancePx??limits.diagramLabelMaximumDistancePx??12);
      if((model.connectorSelector&&!connected)||(!near&&!connected))review("B35-DIAGRAM-003","Diagram label is detached from its target without a verified connecting line.",model.label,
        {kind:"detached-diagram-label",source:model.source,targetSelector:pathFor(target),gapPx:gap,connectorVerified:connected,connectorSelector:model.connectorSelector||null});
    }

    // CONTENT-001: a configurable vocabulary contract, not general natural-
    // language entailment. Compare each visible answer with selected premises.
    const contracts=settings.premiseAnswerChecks?.length?settings.premiseAnswerChecks:[{selector:config.selectors.slides}];
    for(const contract of contracts) {
      const scopes=slide.matches(contract.selector)?[slide]:[...slide.querySelectorAll(contract.selector)];
      for(const scope of scopes) {
        if(scope.closest("[data-b35-allow-new-concepts]"))continue;
        const answerSelector=contract.answerSelectors||".step-solution.final,.practice-answer,[data-b35-answer]";
        const premiseSelector=contract.premiseSelectors||".prompt,.visual-card,.challenge-box,[data-b35-premise]";
        const premiseNodes=[...scope.querySelectorAll(premiseSelector)].filter(node=>shown(node)&&!node.closest(answerSelector));
        if(contract.contextSelectors)premiseNodes.push(...[...slide.querySelectorAll(contract.contextSelectors)].filter(shown));
        const texts=[];
        for(const premise of premiseNodes) {
          const walker=document.createTreeWalker(premise,NodeFilter.SHOW_TEXT);
          while(walker.nextNode()) {const node=walker.currentNode;if(shown(node.parentElement)&&!node.parentElement.closest(answerSelector)&&!node.parentElement.closest("script,style,.hi-wm"))texts.push(node.textContent);}
        }
        const premiseText=texts.join(" ");
        const conceptMarkers=[...scope.querySelectorAll("[data-b35-premise-concepts]")].filter(node=>shown(node)&&!node.closest(answerSelector)).flatMap(node=>node.getAttribute("data-b35-premise-concepts").split(/\s+/));
        const concepts=contract.concepts||settings.premiseConcepts||[];
        for(const answer of scope.querySelectorAll(answerSelector)) {
          if(!visible(answer)||answer.closest("[data-b35-allow-new-concepts]"))continue;
          const required=(answer.getAttribute("data-b35-requires-concepts")||"").split(/\s+/).filter(Boolean);
          for(const concept of concepts) {
            const terms=concept.terms||[],used=required.includes(concept.id)||(terms.length&&terms.some(term=>hasTerm(answer.textContent,term)));
            if(!used||conceptMarkers.includes(concept.id)||terms.some(term=>hasTerm(premiseText,term)))continue;
            review("B35-CONTENT-001",`Answer mentions “${concept.name||concept.id}”, but it is absent from the selected visible premise/context.`,answer,
              {kind:"premise-answer-concept",concept:concept.id,terms,premiseSelectors:premiseSelector,source:"bounded vocabulary comparison; review required"});
          }
          for(const id of required.filter(id=>!concepts.some(concept=>concept.id===id)))if(!conceptMarkers.includes(id))review("B35-CONTENT-001",`Required answer concept “${id}” has no visible premise marker or vocabulary definition.`,answer,{kind:"undefined-required-concept",concept:id});
        }
      }
    }

    // COMPOSITION-002: final-state sibling balance and inter-block clearance.
    if(!finalState())continue;
    for(const group of new Set([...comparisonGroups.map(item=>item.group),...slide.querySelectorAll("[data-b35-balance]")])) {
      if(!visible(group)||group.closest("[data-b35-allow-visual-balance]"))continue;
      const children=[...group.children].filter(visible);
      if(children.length<2)continue;
      const samples=children.map(node=>({selector:pathFor(node),occupancy:contentArea(node)}));
      const ratios=samples.map(sample=>sample.occupancy),min=Math.min(...ratios),max=Math.max(...ratios);
      if(max-min>(limits.compositionBalanceMinimumDifference??.2)&&max/Math.max(min,.001)>(limits.compositionBalanceMaximumRatio??1.8))review("B35-COMPOSITION-002","Related panels have substantially different content densities; review visual balance.",group,{kind:"panel-density-imbalance",measurements:samples,maximumRatio:max/Math.max(min,.001)});
    }
    for(const group of slide.querySelectorAll(settings.spacingSelectors||".card,.visual-card,.step-solution,[data-b35-spacing-group]")) {
      if(!visible(group)||group.closest("[data-b35-allow-crowding]"))continue;
      const children=[...group.children].filter(node=>visible(node)&&!node.matches(".hi-wm,[data-b35-ignore-composition]")&&getComputedStyle(node).position!=="absolute");
      for(let i=1;i<children.length;i++) {
        const a=boxFor(children[i-1]),b=boxFor(children[i]);
        if(contains(a,b)||contains(b,a))continue;
        const horizontalOverlap=Math.min(a.right,b.right)-Math.max(a.left,b.left),gap=(b.top-a.bottom)/scale;
        if(horizontalOverlap>Math.min(a.width,b.width)*.25&&b.top>=a.top&&gap<(limits.visualMinimumBlockGapPx??2))review("B35-COMPOSITION-002","Adjacent teaching blocks have very little vertical clearance.",group,{kind:"teaching-block-crowding",gapPx:gap,previousSelector:pathFor(children[i-1]),nextSelector:pathFor(children[i])});
      }
    }
  }
  return issues;
}

module.exports = { auditVisualReview };
