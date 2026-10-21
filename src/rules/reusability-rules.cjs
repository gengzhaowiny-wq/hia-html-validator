"use strict";

// Self-contained browser audit. Text is evidence only; never evaluate lesson
// strings as patterns/code or infer that a capitalised word is a real pupil.
function auditLessonReusability(config) {
  const settings=config.lessonReusability||{};
  if(settings.enabled!==true)return [];
  const issues=[],slides=[...document.querySelectorAll(config.selectors.slides)];
  const active=config.documentMode?[document.body]:slides.filter(node=>node.classList.contains('active'));
  const step=/Step\s+(\d+)\s*\//i.exec(document.querySelector('#step')?.textContent||'');
  // Include unrevealed authored text and newly inserted text at later states.
  // The lesson runner de-duplicates unchanged findings across reveal steps.
  const pathFor=node=>{const parts=[];for(let n=node;n;n=n.parentElement){if(n.id){parts.unshift('#'+CSS.escape(n.id));break;}const peers=n.parentElement?[...n.parentElement.children].filter(p=>p.localName===n.localName):[];parts.unshift(n.localName+(peers.length>1?`:nth-of-type(${peers.indexOf(n)+1})`:''));}return parts.join(' > ');};
  const normal=text=>String(text||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const textFor=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('script,style,annotation,annotation-xml,.katex-mathml,.hi-wm,.nav').forEach(n=>n.remove());return normal(copy.textContent);};
  const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const protectedTerms=new Set(['Pythagoras','Euclid','Euler','Fibonacci','Thales','Newton','Gauss','Pascal','Archimedes','Descartes','Fermat','He','She','It','They','This','That','Who','What','Which','Each','Everyone','Everybody','Nobody','There','A','An','The','Rectangle','Triangle','Circle','Square','Carbon','Hydrogen','Nitrogen','Students','Learners','Beginners','Teachers','Children','Algebra','Geometry','Trigonometry','Statistics','Probability','Calculus','Percentages','Arithmetic','Ratios','Numbers','Maths','Mathematics',...(settings.allowedTerms||[])].map(s=>String(s).toLocaleLowerCase()));
  const names=(settings.studentNames||[]).filter(n=>typeof n==='string'&&n.trim()).map(n=>normal(n));
  const namePattern="[\\p{Lu}][\\p{Ll}]+(?:[’'-][\\p{Lu}\\p{Ll}]+)?";
  const teacherName=new RegExp(`\\b(?:[Aa]sk|[Tt]ell|[Pp]rompt|[Ii]nvite|[Ee]ncourage)\\s+(${namePattern})\\s+to\\b`,'gu');
  const actor=new RegExp(`\\b(${namePattern})\\s+(?:has|had|earns?|earned|buys?|bought|walks?|walked|scores?|scored|spends?|spent|owns?|receives?|received|travels?|travelled|is\\s+(?:walking|buying|saving|paid))\\b`,'gu');
  const teacherPatterns=[
    /\b(?:ask|tell|prompt|invite|encourage)\s+(?:the\s+)?(?:students?|learners?|class)\b/iu,
    /\breveal\s+(?:one|each|the|all)\s+(?:\w+\s+){0,3}(?:line|step|answer|solution)s?\b/iu,
    /\bpause\s+here\b/iu,
    /\bwork\s+together\s+before\s+revealing\b/iu,
    /\bbefore\s+opening\s+the\s+answer\s+slide\b/iu,
    /\b(?:teacher(?:['’]s)?\s+(?:note|instruction|direction)|for\s+the\s+teacher)\b/iu
  ];
  function emit(rule,node,slide,text,kind,matches,attribute){
    const severity=config.policy?.[rule==='B35-CONTENT-002'?'teacherDirectionSeverity':'studentPersonalisationSeverity']||'warning';
    if(severity==='off')return;
    issues.push({rule,severity,slide:slide?.id||null,runtimeSlide:slide?slides.indexOf(slide)+1:null,header:slide?.querySelector(config.selectors.header)?.textContent||'',selector:pathFor(node),
      message:rule==='B35-CONTENT-002'?'Teacher-only delivery direction appears in reusable lesson content.':'Potential student-specific personalisation appears in reusable lesson content.',
      expected:'Reusable lesson HTML is student-neutral and student-facing; teacher delivery notes are kept separately.',
      impact:'Named learners and teacher pacing directions make a shared lesson appear personalised and can distract from its mathematics.',
      suggestedAction:rule==='B35-CONTENT-002'?'Remove the teacher-only direction from student HTML or move it to a separate teacher guide. Preserve mathematical hints, questions, working and reveal behaviour.':'Remove student personalisation from titles, metadata and prose. Use an anonymous role in word problems; preserve numbers, relationships, mathematical names and source attribution.',
      confidence:'Bounded text/metadata heuristic, not named-entity recognition or proof that a person is a student. Review quoted or historical uses in context.',
      verification:['Review the quoted text in the named element and all reveal states.','Search titles, metadata and dynamically generated text, then revalidate layout and navigation after authorised edits.'],
      constraints:['Detection only; no automatic deletion or anonymisation.','Retain legitimate mathematical content and names; do not weaken checks or invent exceptions to clear findings.','Script/comment strings, external documents and names outside recognised contexts need separate review.'],
      evidence:{kind,text,matched:matches,attribute:attribute||null,scope:config.documentMode?'current document authored content':'active page authored content including unrevealed text',automaticIdentityVerified:false}});
  }
  function inspect(node,slide,text,attribute,metadata=false){
    if(!text)return;
    const quoted=node.closest?.('[data-b35-reusability-context="quotation"]');
    // Explicit quotations remain reviewable; their purpose is reported rather
    // than silently exempting arbitrary content from a student-neutral policy.
    if(settings.teacherDirectionsEnabled!==false){
      const hits=teacherPatterns.flatMap(re=>{const m=text.match(re);return m?[m[0]]:[];});
      for(const m of text.matchAll(teacherName))hits.push(m[0]);
      if(node.matches?.('[data-b35-teacher-note],.teacher-note'))hits.push('explicit teacher-note marker');
      if(hits.length)emit('B35-CONTENT-002',node,slide,text,quoted?'quoted-teacher-direction':'teacher-direction',[...new Set(hits)],attribute);
    }
    if(settings.personalisationEnabled===false)return;
    const hits=[];
    for(const name of names)if(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`,'iu').test(text))hits.push(name);
    for(const re of [teacherName,actor])for(const m of text.matchAll(re))if(!protectedTerms.has(m[1].toLocaleLowerCase()))hits.push(m[1]);
    if(metadata){
      for(const re of [new RegExp(`^(${namePattern})\\s+(?:Y\\s*\\d{1,2}|Year\\s+\\d{1,2}|Grade\\s+\\d{1,2})\\b`,'u'),new RegExp(`^(${namePattern})['’]s\\s+(?:[Mm]aths?|[Ll]esson|[Pp]ractice|[Ww]orksheet)\\b`,'u'),new RegExp(`(?:[Ll]esson|[Pp]ractice|[Ww]orksheet)\\s+for\\s+(${namePattern})\\b`,'u')]){
        const m=text.match(re);if(m&&!protectedTerms.has(m[1].toLocaleLowerCase()))hits.push(m[1]);
      }
    }
    if(attribute==='data-student-name'||attribute==='student-name')hits.push(text);
    if(hits.length)emit('B35-CONTENT-003',node,slide,text,'student-personalisation',[...new Set(hits)],attribute);
  }
  for(const slide of active){
    if(!slide)continue;
    const containers=new Set(),walker=document.createTreeWalker(slide,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const parent=walker.currentNode.parentElement;
      if(!normal(walker.currentNode.textContent)||parent.closest('script,style,.hi-wm,.nav,annotation,annotation-xml'))continue;
      containers.add(parent.closest('.hint,.note,.sub,.teacher-note,[data-b35-teacher-note],p,li,figcaption,td,th,svg text')||parent);
    }
    for(const node of slide.querySelectorAll('[data-b35-teacher-note],.teacher-note'))containers.add(node);
    for(const node of containers)inspect(node,config.documentMode?null:slide,textFor(node));
    for(const node of [slide,...slide.querySelectorAll('[data-student-name],[aria-label],[alt],[title]')])for(const attribute of ['data-student-name','aria-label','alt','title'])if(node.hasAttribute(attribute))inspect(node,config.documentMode?null:slide,normal(node.getAttribute(attribute)),attribute);
  }
  const first=active[0];
  if(first&&(config.documentMode||slides.indexOf(first)===0&&(!step||Number(step[1])===0))){
    const title=document.querySelector('title');if(title)inspect(title,null,normal(title.textContent),'title',true);
    for(const meta of document.querySelectorAll('meta[name="student-name"],meta[name="student"],meta[name="learner-name"]'))inspect(meta,null,normal(meta.content),'student-name',true);
  }
  return issues;
}

module.exports={auditLessonReusability};
