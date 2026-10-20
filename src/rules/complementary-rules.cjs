"use strict";

// Self-contained browser audit. A review-required symbol is NOT a verified
// visual match. Never substitute a computed font weight for measured strokes.
function auditComplementaryChecks(config) {
  const issues=[], limits=config.thresholds||{}, policy=config.policy||{};
  const settings=config.complementaryChecks||{};
  const slides=[...document.querySelectorAll(config.selectors.slides)];
  const shown=node=>{
    for(let item=node;item;item=item.parentElement){const s=getComputedStyle(item);if(s.display==="none"||s.visibility==="hidden"||Number(s.opacity)<=.01)return false;}
    return true;
  };
  const visible=node=>node&&shown(node)&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0;
  const select=(scope,query)=>{try{return [...scope.querySelectorAll(query)];}catch{return [];}};
  const pathFor=node=>{
    const parts=[];
    for(let item=node;item;item=item.parentElement){
      if(item.id){parts.unshift(`#${CSS.escape(item.id)}`);break;}
      const peers=item.parentElement?[...item.parentElement.children].filter(p=>p.localName===item.localName):[];
      parts.unshift(item.localName+(peers.length>1?`:nth-of-type(${peers.indexOf(item)+1})`:""));
    }
    return parts.join(" > ");
  };
  const rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
  const union=boxes=>{
    const valid=boxes.filter(b=>b&&b.width>0&&b.height>0);if(!valid.length)return null;
    const left=Math.min(...valid.map(b=>b.left)),right=Math.max(...valid.map(b=>b.right)),top=Math.min(...valid.map(b=>b.top)),bottom=Math.max(...valid.map(b=>b.bottom));
    return {left,right,top,bottom,width:right-left,height:bottom-top};
  };
  const family=node=>{
    const name=getComputedStyle(node).fontFamily.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
    return config.formulaConsistency?.fontFamilyAliases?.[name]||name;
  };
  const canvas=document.createElement('canvas'),canvasContext=canvas.getContext('2d');
  const semantic="math,.katex,mjx-container";
  // Estimate visible content bounds, excluding MathML outer padding and HTML
  // line leading. This is geometry, not pixel recognition of glyph strokes.
  function contentBounds(root,scale){
    const boxes=[],methods=new Set();
    function visit(node){
      if(node.nodeType===Node.TEXT_NODE){
        if(!visible(node.parentElement))return;
        const style=getComputedStyle(node.parentElement);
        for(const match of node.textContent.matchAll(/\S+/g)){
          const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
          for(const b of range.getClientRects()){
            if(!b.width||!b.height)continue;
            if(canvasContext){
              canvasContext.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              const m=canvasContext.measureText(match[0]);
              if(Number.isFinite(m.fontBoundingBoxAscent)&&m.actualBoundingBoxAscent+m.actualBoundingBoxDescent>0){
                const baseline=b.top+m.fontBoundingBoxAscent*scale;
                const left=b.left-m.actualBoundingBoxLeft*scale,right=b.left+m.actualBoundingBoxRight*scale;
                const top=baseline-m.actualBoundingBoxAscent*scale,bottom=baseline+m.actualBoundingBoxDescent*scale;
                boxes.push({left,right,top,bottom,width:right-left,height:bottom-top});methods.add('text ranges + canvas ink metrics');continue;
              }
            }
            boxes.push(b);methods.add('text range line-box fallback');
          }
        }
        return;
      }
      if(node.nodeType!==Node.ELEMENT_NODE||!shown(node)||node.matches('script,style,.hi-wm,.nav,annotation,annotation-xml,.katex-mathml'))return;
      if(node.localName==='math'){
        const glyphs=select(node,'msqrt,mroot,mfrac,mi,mn,mo,mtext').filter(visible);
        boxes.push(...(glyphs.length?glyphs:[node]).map(rect));methods.add('MathML structural/glyph boxes (outer padding excluded)');return;
      }
      if(node.matches('svg text,svg rect,svg path,svg line,svg circle,svg polygon,img,canvas')){
        if(visible(node))boxes.push(rect(node));methods.add('graphic bounds');return;
      }
      for(const child of node.childNodes)visit(child);
    }
    visit(root);return {box:union(boxes),methods:[...methods]};
  }
  for(const slide of slides.filter(node=>config.documentMode||node.classList.contains('active'))){
    const scale=slide.offsetWidth?slide.getBoundingClientRect().width/slide.offsetWidth:1;
    const finalMatch=/Step\s+(\d+)\s*\/\s*(\d+)/i.exec(document.querySelector('#step')?.textContent||'');
    const finalState=!finalMatch||finalMatch[1]===finalMatch[2];
    const emit=(rule,severity,message,node,evidence,guidance)=>{
      if(severity==='off')return;
      issues.push({rule,severity,message,slide:slide.id,runtimeSlide:slides.indexOf(slide)+1,
        header:(slide.querySelector(config.selectors.header)?.textContent||'').trim(),selector:pathFor(node),evidence,...guidance});
    };
    const commonSafeguards=['Preserve mathematical values, units, diagrams and reveal order. Do not auto-fix lesson content.',
      'Compare like footer roles only; use a documented design exception for an intentional variation.'];
    if(settings.footersEnabled!==false){
      const models=settings.footerGroups||[{selector:'.three,.four,[data-b35-footer-group]',cardSelector:':scope > .card,:scope > .summary-card',footerSelector:':scope > .mini,[data-b35-card-footer]'}];
      const handled=new Set();
      for(const model of models)for(const group of select(slide,model.selector)){
        if(handled.has(group)||!visible(group)||group.closest('[data-b35-allow-footer-variation],[data-b35-allow-card-variation]'))continue;handled.add(group);
        const cards=select(group,model.cardSelector||':scope > .card,:scope > .summary-card').filter(visible);
        if(cards.length<2)continue;
        const samples=cards.map(card=>{
          const footer=select(card,model.footerSelector||':scope > .mini,[data-b35-card-footer]').find(visible);
          if(!footer)return {cardSelector:pathFor(card),missing:true};
          const s=getComputedStyle(footer),b=rect(footer),c=rect(card),content=contentBounds(footer,scale);
          const padding=['Top','Right','Bottom','Left'].map(side=>parseFloat(s['padding'+side])||0);
          const center=content.box?{x:((content.box.left+content.box.right)-(b.left+b.right))/2/scale,y:((content.box.top+content.box.bottom)-(b.top+b.bottom))/2/scale}:null;
          return {cardSelector:pathFor(card),selector:pathFor(footer),missing:false,fontFamily:family(footer),fontSizePx:parseFloat(s.fontSize),fontWeight:Number(s.fontWeight)||400,
            lineHeight:s.lineHeight,paddingPx:padding,textAlign:s.textAlign,heightPx:b.height/scale,
            leftGapPx:(b.left-c.left)/scale,rightGapPx:(c.right-b.right)/scale,bottomGapPx:(c.bottom-b.bottom)/scale,
            centerOffsetPx:center,contentMeasurement:content.methods,contentBox:content.box,box:b};
        });
        const available=samples.filter(s=>!s.missing);
        if(!available.length&&!group.hasAttribute('data-b35-footer-group')&&!model.expectFooters)continue;
        const missing=samples.filter(s=>s.missing);
        const spread=key=>Math.max(...available.map(s=>s[key]))-Math.min(...available.map(s=>s[key]));
        const fontTolerance=limits.footerFontTolerancePx??.5,boxTolerance=limits.footerBoxTolerancePx??1;
        const reasons=[];
        if(finalState&&model.requireAll&&missing.length)reasons.push('missing required visible footer');
        if(available.length>=2){
          if(new Set(available.map(s=>s.fontFamily)).size>1)reasons.push('font family');
          if(spread('fontSizePx')>fontTolerance)reasons.push('font size');
          if(spread('fontWeight')>(limits.footerWeightTolerance??100))reasons.push('font weight');
          if(new Set(available.map(s=>s.lineHeight)).size>1)reasons.push('line-height declaration');
          if([0,1,2,3].some(i=>Math.max(...available.map(s=>s.paddingPx[i]))-Math.min(...available.map(s=>s.paddingPx[i]))>boxTolerance))reasons.push('padding');
        }
        const minFont=model.minimumFontSizePx;
        if(Number.isFinite(minFont)&&available.some(s=>s.fontSizePx<minFont-fontTolerance))reasons.push(`below ${minFont}px declared minimum`);
        if(reasons.length)emit('B35-LAYOUT-002',policy.footerTypographySeverity||'warning',
          `Matching card footers have inconsistent typography or shared styling: ${reasons.join(', ')}. Repair the common footer component, not just its MathML children.`,group,
          {kind:'peer-footer-typography',source:'configured/recognised footer-role group',differences:reasons,measurements:samples},
          {expected:'Corresponding footer roles share the declared base family, size, weight, line-height and padding, including plain-text and maths footers.',
            impact:'Fixing only footers containing maths can make the four cards visibly inconsistent.',
            suggestedAction:'Replace conditional maths-only footer overrides with one shared footer style. Apply the declared readable base size to all corresponding footers, with consistent padding and line-height. Keep structural fraction/exponent sizing.',
            confidence:'Measured computed-style differences; normal-versus-numeric line-height is a declaration difference requiring rendered review.',
            verification:['Re-render all cards after fonts settle and compare every footer, not only equations.','Recheck card fit, content centring and overflow at each supported viewport.'],constraints:commonSafeguards});
        const geometry=[];
        if(available.length>=2){
          if(spread('heightPx')>boxTolerance)geometry.push('unequal footer heights');
          if(spread('bottomGapPx')>boxTolerance)geometry.push('different bottom offsets within cards');
          if(spread('leftGapPx')>boxTolerance||spread('rightGapPx')>boxTolerance)geometry.push('different horizontal box insets');
        }
        const tolerance=limits.footerContentCenterTolerancePx??2;
        const horizontal=model.alignment?.horizontal,vertical=model.alignment?.vertical;
        if(horizontal==='center'&&available.some(s=>!s.centerOffsetPx||Math.abs(s.centerOffsetPx.x)>tolerance))geometry.push('content not horizontally centred');
        if(vertical==='center'&&available.some(s=>!s.centerOffsetPx||Math.abs(s.centerOffsetPx.y)>tolerance))geometry.push('content not vertically centred');
        // Without an alignment contract, left-aligned text is not an error.
        if(geometry.length)emit('B35-LAYOUT-003',policy.footerAlignmentSeverity||'warning',
          `Matching footer boxes/content are misaligned: ${geometry.join(', ')}. Aligned bottom edges alone do not establish centred content.`,group,
          {kind:'peer-footer-alignment',differences:geometry,expectedAlignment:model.alignment||null,boxTolerancePx:boxTolerance,contentCenterTolerancePx:tolerance,measurements:samples},
          {expected:'Footer boxes have consistent heights/insets, and their rendered content follows the explicitly declared horizontal/vertical alignment.',
            impact:'Different footer heights and internal centres can make a row look uneven even when every bottom edge aligns.',
            suggestedAction:'Use a shared footer row height that fits the longest content, common insets, and the declared alignment for all footers. Centre a content wrapper as a whole; keep the equation inline within that wrapper rather than stretching each token as a separate flex/grid item.',
            confidence:'Scale-normalised box measurements and estimated glyph/content bounds, not pixel-level optical certification.',
            verification:['Measure the footer boxes AND content centres; do not rely only on text-align or bottom-edge equality.','Visually review ordinary text, multiline text and MathML together; confirm no clipping or new wrapping.'],constraints:commonSafeguards});
      }
    }

    const symbols=settings.symbolRendering||{};
    if(symbols.enabled===false)continue;
    // A split glyph + CSS border is fragile even with matching font weights.
    // Declared SVG radicals expose geometry; neither check certifies optics.
    if(symbols.radicalGeometryEnabled!==false){
      for(const node of select(slide,'.root,svg[data-b35-diagram="radical"]')){
        if(!visible(node)||node.closest('[data-b35-allow-radical-variation]'))continue;
        const split=node.matches('.root')&&!!node.querySelector('.root-mark,.radicand');
        const sign=node.querySelector('[data-b35-radical-sign]'),radicand=node.querySelector('[data-b35-radicand]');
        let reason=split?'Radical uses a separate text glyph and CSS overbar.':null;
        let measurement=null;
        if(!split&&sign&&radicand){
          const a=rect(sign),b=rect(radicand),v=node.getBoundingClientRect();
          measurement={signBox:a,radicandBox:b,svgBox:rect(node)};
          const t=limits.radicalGeometryTolerancePx??2;
          // Text line boxes may extend below the radical hook because of
          // descenders/leading. Compare the bottom against the SVG instead.
          if(b.top<a.top-t*scale||b.right>a.right+t*scale||b.bottom>v.bottom+t*scale||b.left<v.left-t*scale||b.right>v.right+t*scale)
            reason='Radicand extends beyond its declared radical sign or SVG bounds.';
        }else if(!split)reason='Declared SVG radical is missing sign or radicand geometry markers.';
        if(reason)emit('B35-MATH-020',policy.radicalGeometrySeverity||'warning',reason,node,
          {kind:'radical-construction',renderer:split?'split HTML/CSS':'declared SVG',measurement,visualAppearanceVerified:false},
          {expected:'Use a coherent radical renderer with a continuous hook/overbar enclosing the complete radicand.',
            impact:'Detached bars, oversized hooks or displaced radicands can make the expression ambiguous.',
            suggestedAction:'Render the radical as one native math structure or one SVG; inspect hook/bar joins, stroke balance and radicand clearance at normal size.',
            confidence:'Construction/geometry heuristic; native MathML and passing SVG geometry do not establish optical correctness.',
            verification:['Review the complete expression at the intended viewport.','Check every reveal state and remeasure after fonts load.'],
            constraints:['Do not change mathematical content.','No screenshot pixel analysis or automatic visual approval.']});
      }
    }
    const groups=new Map();
    for(const node of select(slide,symbols.selectors||'msqrt,mroot,mfrac,.root,.frac,[data-b35-math-symbol],svg text')){
      const rawBox=rect(node),rawStyle=getComputedStyle(node);
      const strokedSvg=node.namespaceURI==='http://www.w3.org/2000/svg'&&rawStyle.stroke!=='none'&&parseFloat(rawStyle.strokeWidth)>0&&Math.max(rawBox.width,rawBox.height)>0;
      if(!shown(node)||(!visible(node)&&!strokedSvg))continue;
      const kind=['msqrt','mroot'].includes(node.localName)||node.matches('.root')||/[√∛]/.test(node.textContent)&&node.matches('svg text')?'radical':
        node.localName==='mfrac'||node.matches('.frac')?'fraction-bar':node.getAttribute('data-b35-math-symbol');
      if(!['radical','fraction-bar'].includes(kind))continue;
      const owner=node.closest(symbols.formulaScopes||'.formula,.work,.mini,.step-solution,.practice-answer,.prompt,[data-b35-equation],[data-b35-formula-row]')||node.closest('math')?.parentElement||node.closest('svg')||node.parentElement;
      if(!visible(owner))continue;
      const s=getComputedStyle(node),b=rect(node);
      let stroke=null,method='browser-generated/glyph stroke is not exposed as a DOM measurement';
      if(node.namespaceURI==='http://www.w3.org/2000/svg'&&!node.matches('text,tspan')){
        const matrix=node.getScreenCTM?.(),factor=matrix?Math.hypot(matrix.a,matrix.b)/scale:1;
        if(s.stroke!=='none'&&parseFloat(s.strokeWidth)>0){stroke=parseFloat(s.strokeWidth)*(s.vectorEffect==='non-scaling-stroke'?1/scale:factor);method='declared SVG stroke width in slide-design pixels';}
        else if(node.localName==='rect'&&s.fill!=='none'){stroke=Math.min(b.width,b.height)/scale;method='filled SVG bar thickness in slide-design pixels';}
      }
      const sample={selector:pathFor(node),kind,renderer:node.namespaceURI==='http://www.w3.org/1998/Math/MathML'?'native MathML':node.namespaceURI==='http://www.w3.org/2000/svg'?'SVG':'HTML/CSS',
        fontFamily:s.fontFamily,fontSizePx:parseFloat(s.fontSize),fontWeight:s.fontWeight,fontStyle:s.fontStyle,fontVariationSettings:s.fontVariationSettings,
        paint:{color:s.color,fill:s.fill,fillOpacity:s.fillOpacity,stroke:s.stroke,strokeOpacity:s.strokeOpacity,opacity:s.opacity},
        measuredStrokePx:stroke,strokeMeasurement:method,box:b};
      if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(sample);
    }
    for(const [owner,samples]of groups){
      const ownerStyle=getComputedStyle(owner);
      const tokenStyles=select(owner,'math,msqrt,mroot,mfrac,mi,mn,mo,mtext,.root,.frac,[data-b35-math-symbol]').filter(visible).map(n=>{
        const s=getComputedStyle(n),b=rect(n);return [n.localName,s.fontFamily,s.fontSize,s.fontWeight,s.fontStyle,s.fontVariationSettings,s.color,s.strokeWidth,s.mathStyle,
          ...['left','top','width','height'].map(k=>Math.round((k==='left'?b[k]-rect(owner).left:k==='top'?b[k]-rect(owner).top:b[k])/scale*100)/100)];
      });
      const fontState=[...document.fonts].map(f=>[f.family,f.weight,f.status]).sort();
      const sampledStyles=samples.map(s=>[s.selector,s.fontFamily,s.fontSizePx,s.fontWeight,s.fontStyle,s.fontVariationSettings,s.paint,s.measuredStrokePx,
        Math.round(s.box.width/scale*100)/100,Math.round(s.box.height/scale*100)/100]);
      const signatureSource=JSON.stringify([owner.outerHTML,ownerStyle.fontFamily,ownerStyle.fontSize,ownerStyle.fontWeight,ownerStyle.color,tokenStyles,sampledStyles,fontState]);
      let hash=2166136261;for(let i=0;i<signatureSource.length;i++){hash^=signatureSource.charCodeAt(i);hash=Math.imul(hash,16777619);}
      const fingerprint='symbol-v1-'+(hash>>>0).toString(16).padStart(8,'0');
      const selector=pathFor(owner);
      const contracts=symbols.strokeContracts||[];
      const violations=[];
      for(const sample of samples)if(sample.renderer==='SVG'){
        const transparent=color=>color==='none'||color==='transparent'||/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
        if((transparent(sample.paint.fill)||Number(sample.paint.fillOpacity)<=.01)&&(transparent(sample.paint.stroke)||Number(sample.paint.strokeOpacity)<=.01))violations.push({selector:sample.selector,reason:'declared/recognised symbol has geometry but no visible fill or stroke'});
      }
      for(const contract of contracts)for(const sample of samples){
        let matches=false;try{matches=document.querySelector(sample.selector)?.matches(contract.selector);}catch{
          violations.push({selector:contract.selector,reason:'invalid declared stroke selector'});continue;
        }
        if(!matches)continue;
        if(sample.measuredStrokePx===null)violations.push({selector:sample.selector,reason:'declared stroke contract cannot be measured for this renderer'});
        else if((Number.isFinite(contract.minimumPx)&&sample.measuredStrokePx<contract.minimumPx)||(Number.isFinite(contract.maximumPx)&&sample.measuredStrokePx>contract.maximumPx))violations.push({selector:sample.selector,reason:'measured stroke is outside the declared range',actualPx:sample.measuredStrokePx,minimumPx:contract.minimumPx,maximumPx:contract.maximumPx});
      }
      // Only an explicit external review record, bound to this current render,
      // can clear the pending review. A CSS weight or an HTML 'reviewed' flag cannot.
      const approval=(symbols.approvals||[]).find(a=>a.selector===selector&&a.fingerprint===fingerprint&&a.decision==='accepted'
        &&typeof a.reviewer==='string'&&a.reviewer.trim()&&typeof a.evidenceRef==='string'&&a.evidenceRef.trim()
        &&typeof a.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(a.reviewedAt)&&Number.isFinite(Date.parse(a.reviewedAt)));
      if(approval&&!violations.length)continue;
      emit('B35-MATH-019',policy.symbolRenderingSeverity||'warning',
        violations.length?'Mathematical-symbol stroke contract is unmet or unmeasurable; inspect the listed operators.':
          'Mathematical-symbol strokes require visual review: matching CSS font weights do not verify radical signs or fraction bars.',owner,
        {kind:'symbol-stroke-review',status:violations.length?'contract-unmet':'review-required',visualWeightVerified:false,fingerprint,
          ownerStyle:{fontFamily:ownerStyle.fontFamily,fontSize:ownerStyle.fontSize,fontWeight:ownerStyle.fontWeight},symbols:samples,violations,cropBoxCssPx:rect(owner),
          approvalStatus:(symbols.approvals||[]).some(a=>a.selector===selector)?'no valid current approval':'no approval recorded'},
        {expected:'Radical hooks/overbars and fraction bars are visually balanced with their equation in the intended maths style. Identical stroke widths are not universally required.',
          impact:'A renderer may report weight 900 for every token while still drawing a noticeably lighter radical sign or bar.',
          suggestedAction:'Inspect a close-up of the entire equation at normal lesson size and enlarged resolution. Compare the radical hook/bar or fraction bar with the digits, operators and answer. Repair genuinely unbalanced rendering using a coherent maths font/renderer, or record an explicit evidence-backed acceptance of an intentional mathematical style. Do not merely reapply font-weight or thicken the digits.',
          confidence:'Review required: native MathML/glyph stroke thickness is not inferred from computed CSS. Explicit SVG-bar measurements are reported only where available.',
          verification:['Keep this warning open until the actual rendered equation is reviewed; a complete MathML expression is not visual approval.',
            'An accepted review record must include this selector/fingerprint, reviewer, ISO timestamp and evidenceRef. Re-review after a fingerprint change; never fabricate approval evidence.',
            'Recheck typography, full-equation rendering, centring and clipping after any repair.'],
          constraints:['Detection/review only; no automatic lesson mutation.','A configured review record is an assertion by the reviewer, not independent machine verification of its screenshot. Fingerprints bind DOM/styles/font-load state, not font-binary contents; re-review after font/browser changes.']});
    }
  }
  return issues;
}

module.exports={auditComplementaryChecks};
