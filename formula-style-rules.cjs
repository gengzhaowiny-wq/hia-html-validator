"use strict";

// Serialized into the browser. All measurements use the current rendered state.
function auditFormulaStyles(config) {
  const issues = [];
  const slides = [...document.querySelectorAll(config.selectors.slides)];
  const settings = config.formulaConsistency || {};
  const sizeRatio = config.thresholds.formulaMaximumFontSizeRatio ?? 1.2;
  const gapMinimum = config.thresholds.formulaMinimumLineGapPx ?? 2;
  const clipTolerance = config.thresholds.formulaClippingTolerancePx ?? 2;
  const semantic = "math,.frac,.root,.katex,mjx-container";
  const scripts = "sup,sub,.power,msup,msub,msubsup";
  const shown = (node) => {
    for (let item = node; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
    }
    return true;
  };
  const visible = (node) => shown(node) && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  const selector = (node) => {
    const parts = [];
    for (let item = node; item && parts.length < 8; item = item.parentElement) {
      if (item.id) { parts.unshift(`#${item.id}`); break; }
      const siblings = item.parentElement ? [...item.parentElement.children].filter((other) => other.localName === item.localName) : [];
      parts.unshift(`${item.localName}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(item) + 1})` : ""}`);
    }
    return parts.join(" > ");
  };
  const union = (boxes) => {
    const nonempty = boxes.filter((box) => box.width > 0 && box.height > 0);
    if (!nonempty.length) return null;
    const left = Math.min(...nonempty.map((box) => box.left));
    const right = Math.max(...nonempty.map((box) => box.right));
    const top = Math.min(...nonempty.map((box) => box.top));
    const bottom = Math.max(...nonempty.map((box) => box.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const ink = (node) => union([node, ...node.querySelectorAll("mfrac,mrow,mn,mi,mo,msup,msub,msqrt")].map((item) => item.getBoundingClientRect()));
  const family = (node) => {
    const value = getComputedStyle(node).fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    const aliases = settings.fontFamilyAliases || {};
    return aliases[value] || value;
  };
  const fontSize = (node) => {
    let scale = 1;
    const svgNode = node.closest("foreignObject") || (node.namespaceURI === "http://www.w3.org/2000/svg" ? node : null);
    if (svgNode?.getScreenCTM) {
      const matrix = svgNode.getScreenCTM();
      if (matrix) scale = Math.hypot(matrix.a, matrix.b);
    } else {
      const slide = node.closest(config.selectors.slides);
      if (slide?.offsetWidth) scale = slide.getBoundingClientRect().width / slide.offsetWidth;
    }
    return parseFloat(getComputedStyle(node).fontSize) * scale;
  };
  const atoms = (root) => {
    const values = [];
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim() && visible(node.parentElement)) values.push({ node: node.parentElement, text: node.textContent, textNode: node, semantic: false });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || !visible(node)) return;
      if (node.matches("script,style,annotation,annotation-xml,.katex-mathml")) return;
      if (node.matches(settings.labelSelectors || ".book,.tag,.answer-tag,.challenge-title,.formula-label,.practice-num,.qnum,[data-b35-formula-label]")) return;
      if (node !== root && node.matches(semantic)) { values.push({ node, text: node.textContent, semantic: true }); return; }
      // Exponents and subscripts intentionally have a smaller size. They are
      // checked as notation below, not compared to surrounding base glyphs.
      if (node !== root && node.matches(scripts)) return;
      for (const child of node.childNodes) visit(child);
    }
    if (root.matches(semantic)) return [{ node: root, text: root.textContent, semantic: true }];
    visit(root);
    return values;
  };
  const mathLike = (root) => root.querySelector(semantic) || /[=≤≥<>]|\d\s*[%％]|[a-z0-9]\s*[+×÷−]/i.test(root.textContent);
  const baseMathTokens = (root) => {
    const result = [];
    function visit(node) {
      if (!visible(node)) return;
      if (["mi", "mn", "mo", "mtext", "mfrac"].includes(node.localName)) { result.push(node); return; }
      if (["msup", "msub", "msubsup", "mover", "munder", "munderover", "mroot"].includes(node.localName)) {
        if (node.firstElementChild) visit(node.firstElementChild);
        return;
      }
      for (const child of node.children) visit(child);
    }
    visit(root);
    return result.length ? result : [root];
  };
  const baseWeightTokens = (root) => {
    const result = [];
    function visit(node) {
      if (!visible(node)) return;
      if (["mi","mn","mo","mtext"].includes(node.localName)) { result.push(node); return; }
      if (["msup","msub","msubsup","mover","munder","munderover","mroot"].includes(node.localName)) {
        if (node.firstElementChild) visit(node.firstElementChild);
        return;
      }
      for (const child of node.children) visit(child);
    }
    visit(root);
    return result.length ? result : [root];
  };

  for (const slide of slides.filter((item) => config.documentMode || item.classList.contains("active"))) {
    const emit = (rule, severity, message, node, evidence = {}, guidance = {}) => {
      if (severity === "off") return;
      issues.push({ rule, severity, message, slide: slide.id, runtimeSlide: slides.indexOf(slide) + 1,
        header: (slide.querySelector(config.selectors.header)?.textContent || "").trim(), selector: selector(node), evidence, ...guidance });
    };
    const typographySeverity = config.policy.formulaTypographySeverity || "warning";
    const notationSeverity = config.policy.formulaNotationSeverity || "warning";
    const explicit = settings.formulaSelectors || ".formula,.work,[data-b35-formula],[data-b35-formula-row]";
    const contexts = new Set([...slide.querySelectorAll(explicit)].filter(visible));
    for (const node of slide.querySelectorAll(".prompt,.step-solution,.practice-answer")) {
      if (visible(node) && !node.querySelector(explicit) && mathLike(node)) contexts.add(node);
    }
    for (const foreign of slide.querySelectorAll("svg foreignObject")) {
      if (foreign.querySelector(semantic) && visible(foreign)) contexts.add(foreign.parentElement);
    }
    // Plain SVG text can itself contain separately styled tspans in one formula.
    for (const node of slide.querySelectorAll("svg text")) {
      if (visible(node) && mathLike(node) && !contexts.has(node.parentElement)) contexts.add(node);
    }
    for (const node of slide.querySelectorAll(settings.teachingEquationSelectors || ".formula,.mini,[data-b35-equation],[data-b35-formula-role='teaching']")) {
      if (visible(node) && mathLike(node)) contexts.add(node);
    }
    // Discover semantic maths in ordinary footers/callouts, not only named
    // formula classes. Do not promote a whole card containing known formulas:
    // its heading and explanatory prose are not one equation.
    const labels = settings.labelSelectors || ".book,.tag,.answer-tag,.challenge-title,.formula-label,.practice-num,.qnum,[data-b35-formula-label]";
    for (const formula of slide.querySelectorAll(semantic)) {
      if (!visible(formula) || formula.closest(labels) || [...contexts].some(root => root === formula || root.contains(formula))) continue;
      const container = formula.parentElement.closest(settings.automaticContextSelectors || ".mini,.note,.rule,p,li,td,th,figcaption,div");
      if (container && container !== slide && !container.querySelector("h1,h2,h3,h4,h5,h6")
        && ![...contexts].some(root => container.contains(root)) && mathLike(container)) contexts.add(container);
    }
    for (const root of contexts) {
      if (!visible(root)) continue;
      const values = atoms(root);
      if (!values.length) continue;
      const typographyValues = values.filter((value) => value.semantic || /[\d=+−×÷%％a-z]/i.test(value.text));
      if (!root.closest("[data-b35-allow-formula-style]")) {
        const fontNodes = typographyValues.flatMap((value) => value.node.localName === "math"
          ? [value.node, ...value.node.querySelectorAll("mi,mn,mo,mtext")].filter(visible) : [value.node]);
        const families = [...new Set(fontNodes.map(family))];
        if (families.length > 1) emit("B35-MATH-006", typographySeverity,
          `One formula uses different computed font families: ${families.join(", ")}.`, root, {
            kind: "within-formula-family", families,
            tokens: typographyValues.map((value) => ({ text: value.node.getAttribute("aria-label") || value.text.trim().slice(0, 60), family: family(value.node), selector: selector(value.node) }))
          });
        const sizes = typographyValues.flatMap((value) => value.node.localName === "math" ? baseMathTokens(value.node).map(fontSize) : [fontSize(value.node)]).filter((size) => size > 0);
        const ratio = sizes.length ? Math.max(...sizes) / Math.min(...sizes) : 1;
        if (ratio > sizeRatio + 0.01) emit("B35-MATH-007", typographySeverity,
          `Base formula font sizes differ by a factor of ${ratio.toFixed(2)}; allowed maximum is ${sizeRatio}.`, root,
          { kind: "within-formula-size", minimumPx: Math.min(...sizes), maximumPx: Math.max(...sizes), ratio });
        const weightTokens = typographyValues.flatMap(value => value.node.localName === "math"
          ? baseWeightTokens(value.node).map(node => ({node,text:node.textContent})) : [value]);
        const weights = weightTokens.map(value => ({selector:selector(value.node),text:value.text.trim().slice(0,80),
          weight:Number(getComputedStyle(value.node).fontWeight)||400}));
        const minimumWeight = Math.min(...weights.map(value=>value.weight)), maximumWeight = Math.max(...weights.map(value=>value.weight));
        if (weights.length > 1 && !root.closest("[data-b35-allow-formula-weight]") && minimumWeight <= 500 && maximumWeight >= 600
          && maximumWeight-minimumWeight >= (config.thresholds.formulaMaximumFontWeightDifference ?? 200)) {
          emit("B35-MATH-016", typographySeverity,
            `Equation mixes regular-weight maths (${minimumWeight}) with bold base text (${maximumWeight}); align the visual weight across the equation.`, root,
            {kind:"within-formula-weight",minimumWeight,maximumWeight,measurements:weights}, {
              expected:"Comparable base digits and operators in one equation use a consistent visual weight; structural exponents and subscripts may differ.",
              impact:"A radical or fraction can look faint or smaller than its answer even when computed font sizes match.",
              suggestedAction:"Inspect the listed tokens. Inherit the equation's intended font weight into the MathML/renderer wrapper and its base tokens, or give the whole equation a consistent regular weight. Do not resize only the radical sign.",
              confidence:"Computed regular-versus-bold mismatch; visual review is required because emphasis can be intentional.",
              verification:["Re-render after fonts settle and compare both sides of the equals sign.","Re-run family/size, clipping and spacing checks; preserve the equation and structural script sizes."]
            });
        }
      }
      // A teaching equation can be consistently tiny, so relative comparison
      // alone is insufficient. This is a design-space floor, independent of
      // viewport zoom, and excludes intentional fractional/script reductions.
      const compact = root.textContent.replace(/\s+/g," ").trim();
      const teaching = root.matches(settings.teachingEquationSelectors || ".formula,.mini,[data-b35-equation],[data-b35-formula-role='teaching']")
        && /[=<>≤≥≈]/.test(compact) && (root.querySelector(semantic) || /\d/.test(compact))
        && compact.length <= (settings.teachingEquationMaximumCharacters ?? 120);
      if (teaching && !root.closest("[data-b35-allow-small-equation]")) {
        const scale = slide.offsetWidth ? slide.getBoundingClientRect().width/slide.offsetWidth : 1;
        const baseTokens = typographyValues.flatMap(value => value.node.localName === "math" ? baseMathTokens(value.node) : [value.node]);
        const samples = baseTokens.map(node=>({selector:selector(node),designFontPx:fontSize(node)/scale})).filter(sample=>sample.designFontPx>0);
        const minimum = config.thresholds.teachingEquationMinimumFontPx ?? 18;
        const actual = Math.min(...samples.map(sample=>sample.designFontPx));
        if (samples.length && actual < minimum-.01) emit("B35-MATH-017", typographySeverity,
          `Teaching equation uses ${actual.toFixed(1)}px base text on the lesson canvas; configured minimum is ${minimum}px. Enlarge the whole equation for classroom reading.`, root,
          {kind:"teaching-equation-readability",minimumBaseDesignPx:actual,minimumRequiredDesignPx:minimum,measurements:samples}, {
            expected:`Standalone teaching equations have base text of at least ${minimum}px in the slide's unscaled design coordinates.`,
            impact:"Equal font sizes on both sides can still be too small for a projected lesson.",
            suggestedAction:"Increase the whole equation container's base font size, including the equals sign and answer, and let its maths wrapper inherit it. Keep intentional numerator, denominator and exponent reductions; check the card still fits.",
            confidence:"Configured classroom-readability threshold, not a universal typography standard.",
            verification:["Check the equation at the normal 960×540 lesson canvas, not only a zoomed browser view.","Confirm no new clipping, overlap or unwanted wrapping; keep neighbouring diagrams and mathematical content unchanged."]
          });
      }
      // A semantic fraction is a boundary, not whitespace: joining around it
      // would falsely read '3 [fraction] %' as the spaced percentage '3 %'.
      const plain = values.map((value) => value.semantic ? "\uFFFC" : value.text).join("");
      const fractions = [];
      for (const value of values.filter((value) => value.semantic)) {
        if (value.node.matches(".frac") || value.node.querySelector(".frac")) fractions.push("CSS fraction");
        if (value.node.querySelector("mfrac")) fractions.push("MathML fraction");
        if ([...value.node.querySelectorAll("mo")].some((token) => ["/", "⁄"].includes(token.textContent.trim()))) fractions.push("slash fraction");
        if (/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(value.text)) fractions.push("Unicode fraction");
      }
      // Remove dates and URLs before considering a slash as fraction notation.
      const fractionText = plain.replace(/https?:\/\/\S+|\b\d{1,4}\/\d{1,2}\/\d{1,4}\b/g, " ");
      const unitNames = new Set(["km", "m", "cm", "mm", "mi", "ft", "in", "kg", "g", "lb", "hr", "h", "min", "sec", "s"]);
      const slashFractions = [...fractionText.matchAll(/(\b\d+(?:\.\d+)?|\b[A-Za-z]{1,2})\s*\/\s*(\d+(?:\.\d+)?|[A-Za-z]{1,2}\b)/g)]
        .filter((match) => !(unitNames.has(match[1].toLowerCase()) && unitNames.has(match[2].toLowerCase())));
      if (slashFractions.length) fractions.push("slash fraction");
      if (/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(plain)) fractions.push("Unicode fraction");
      if (!root.closest("[data-b35-allow-mixed-notation]")) {
        const types = [...new Set(fractions)];
        if (types.length > 1) emit("B35-MATH-008", notationSeverity,
          `Fraction presentation changes within one formula: ${types.join(" and ")}.`, root, { kind: "mixed-fraction-renderers", types });
        const percents = [...plain.matchAll(/\d(?:\.\d+)?(\s*)([%％])/g)];
        const percentGlyphs = [...new Set(percents.map((item) => item[2]))];
        const percentSpacing = [...new Set(percents.map((item) => item[1].length ? "spaced" : "attached"))];
        if (percentGlyphs.length > 1 || percentSpacing.length > 1) emit("B35-MATH-009", notationSeverity,
          "Percentage symbols or number-to-percent spacing vary within one formula.", root,
          { kind: "percent-format-mismatch", glyphs: percentGlyphs, spacing: percentSpacing });
        const powerTypes = [];
        if (/[A-Za-z0-9)]\s*\^\s*(?:\d|\{)/.test(plain)) powerTypes.push("raw caret");
        if (/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(root.textContent)) powerTypes.push("Unicode superscript");
        if (root.querySelector("sup,msup,.power")) powerTypes.push("semantic superscript");
        if (powerTypes.includes("raw caret") || powerTypes.length > 1) emit("B35-MATH-010", notationSeverity,
          `Review power notation: ${powerTypes.join(" and ")}.`, root, { kind: "power-notation", types: powerTypes });
      }

      // br-separated equation rows can have overlapping glyphs even when their
      // parent containers have no overflow. Compare actual ink between rows.
      if (root.querySelector("br") && !root.closest("[data-b35-allow-math-overlap]")) {
        const rows = [[]];
        function collect(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim() && visible(node.parentElement)) {
              const range = document.createRange(); range.selectNodeContents(node);
              rows.at(-1).push(...range.getClientRects());
            }
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.localName === "br" && shown(node)) { rows.push([]); return; }
          if (!visible(node)) return;
          if (node !== root && node.matches(semantic)) { rows.at(-1).push(ink(node)); return; }
          for (const child of node.childNodes) collect(child);
        }
        collect(root);
        const lines = rows.map((row) => union(row.filter(Boolean))).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const horizontalOverlap = Math.min(lines[i - 1].right, lines[i].right) - Math.max(lines[i - 1].left, lines[i].left);
          const gap = lines[i].top - lines[i - 1].bottom;
          if (horizontalOverlap > clipTolerance && gap < gapMinimum) emit("B35-MATH-013", gap < -clipTolerance ? (config.policy.formulaLineCollisionSeverity || "error") : "warning",
            `Adjacent equation lines have ${gap.toFixed(1)}px of ink clearance; configured minimum is ${gapMinimum}px.`, root,
            { kind: "equation-line-clearance", line: i + 1, gapPx: gap, previousLine: lines[i - 1], currentLine: lines[i] });
        }
      }
    }

    // MATH-018: standalone equations belong to one complete maths renderer,
    // not a root/fraction island followed by HTML operators and an HTML answer.
    // This is a configurable authoring contract, not an HTML validity rule.
    if (settings.fullEquationMathML !== false) {
      const scopes = new Set([...contexts, ...slide.querySelectorAll(settings.standaloneEquationSelectors
        || ".formula,.work,.mini,.step-solution,.practice-answer,p,[data-b35-equation],[data-b35-formula-row],[data-b35-standalone-equation]")].filter(visible));
      const accepted = new Set(settings.standaloneEquationRenderers || ["mathml"]);
      const words = new Set(settings.standaloneEquationWords || ["sin","cos","tan","log","ln","exp","sqrt","abs","max","min","mod","lim","cm","mm","km","mg","kg","ml","ms","sec","min","rad","Area","Perimeter","Distance","Side"]);
      const relation = /[=<>≤≥≈≠]/;
      for (const scope of scopes) {
        if (scope.closest("[data-b35-allow-split-equation],pre,code,a,textarea,.hi-wm,.nav")) continue;
        const rows = []; let row = [];
        const flush = () => { if (row.some(token=>token.text.trim())) rows.push(row); row=[]; };
        function collect(node) {
          if (node.nodeType===Node.TEXT_NODE) {
            if (node.textContent.trim() && visible(node.parentElement)) row.push({node:node.parentElement,text:node.textContent,renderer:null});
            return;
          }
          if (node.nodeType!==Node.ELEMENT_NODE || !shown(node) || node.matches(`script,style,annotation,annotation-xml,.katex-mathml,pre,code,a,textarea,${labels}`)) return;
          if (node.localName==="br") { flush(); return; }
          // Each nested known row is audited separately, without including the
          // parent card's heading or duplicating its equation finding.
          if (node!==scope && scopes.has(node)) { flush(); return; }
          if (node.matches(semantic)) {
            const renderer=node.localName==="math"?"mathml":node.matches(".katex")?"katex":node.localName==="mjx-container"?"mathjax":"css-math";
            row.push({node,text:node.textContent,renderer}); return;
          }
          const block=node!==scope && ["block","flex","grid","table","list-item"].includes(getComputedStyle(node).display);
          if (block) flush();
          for (const child of node.childNodes) collect(child);
          if (block) flush();
        }
        collect(scope); flush();
        const explicitStandalone=scope.matches("[data-b35-equation],[data-b35-standalone-equation]");
        const failures=[];
        rows.forEach((tokens,index)=>{
          const text=tokens.map(token=>token.text).join("").replace(/\s+/g," ").trim();
          const outside=tokens.filter(token=>!token.renderer).map(token=>token.text).join("");
          const prose=[...outside.matchAll(/[\p{L}]+/gu)].map(match=>match[0])
            .filter(word=>word.length>1 && !words.has(word) && !/^[A-Z]{2}$/.test(word));
          if (!explicitStandalone && (!relation.test(text) || prose.length || text.length>(settings.standaloneEquationMaximumCharacters??160))) return;
          const rendered=tokens.filter(token=>token.renderer);
          // Punctuation after an equation is prose punctuation, not a split
          // answer. Units and mathematical signs outside it are not ignored.
          const punctuationOnly=/^[\s.,;:!?]*$/.test(outside);
          const completeParts=rendered.length===1 || rendered.every(token=>/[^\s=<>≤≥≈≠][\s\S]*[=<>≤≥≈≠][\s\S]*[^\s=<>≤≥≈≠]/.test(token.text.trim()));
          if (rendered.length && punctuationOnly && completeParts && rendered.every(token=>accepted.has(token.renderer))) return;
          failures.push({row:index+1,textContent:text,scopeMarkup:scope.outerHTML.slice(0,5000),classification:explicitStandalone?"declared standalone equation":"bounded equation-only row; no detected prose",
            outsideMathText:outside.trim(),rendererParts:rendered.map(token=>({renderer:token.renderer,selector:selector(token.node),
              textContent:token.text.trim().slice(0,160),accessibleLabel:token.node.getAttribute("aria-label")||null,markup:token.node.outerHTML.slice(0,1200)})),
            outsideLocations:[...new Set(tokens.filter(token=>!token.renderer && token.text.trim()).map(token=>selector(token.node)))]});
        });
        if (failures.length) emit("B35-MATH-018", config.policy.fullEquationMathMLSeverity || "warning",
          `Standalone equation is not wholly rendered in ${[...accepted].join(" or ")}: ${failures.length} row(s) use HTML maths or split renderer fragments. Render each complete equation together.`,scope,
          {kind:"incomplete-equation-rendering",acceptedRenderers:[...accepted],rows:failures}, {
            expected:"Each standalone equation, including both sides of its relation, operators, powers and units, is rendered as a complete MathML expression (or an explicitly allowed complete renderer). Inline maths in explanatory prose may remain embedded in HTML.",
            impact:"Token-only conversion can leave a radical/fraction in MathML while its equals sign and answer use HTML, with inconsistent spacing, baselines or visual weight.",
            suggestedAction:"For each listed row, move the complete mathematical expression into one MathML `math` element using semantic tokens such as `mo`, `mn`, `mi`, `msqrt` and `mfrac`. Keep explanatory prose and labels outside it. Preserve all numbers, variables, signs, units and reveal steps; do not convert a whole teaching paragraph into maths.",
            confidence:explicitStandalone?"Explicit standalone-equation contract.":"Conservative text/DOM inference; review ambiguous mathematical labels before acting.",
            verification:["Confirm the full equation is inside one accepted renderer, not several isolated root/fraction fragments.","Re-render and check size, baseline, spacing, clipping and radical/fraction-bar strokes. A complete MathML expression alone does not prove equal visual weight."],
            constraints:["Detection only: flag for review; do not edit lesson content automatically.","Use the supplied markup and labels when repairing: DOM textContent alone omits structural radical signs, fraction bars and superscript positioning.","Use a documented exception for intentional mixed rendering; do not flag ordinary sentences merely because they contain inline maths."]
          });
      }
    }

    // Compare related formula rows only within an explicit/known peer group.
    // Heading typography elsewhere on a slide is deliberately excluded.
    for (const group of slide.querySelectorAll(settings.peerSelectors || ".steps-col,.practice-answers,[data-b35-formula-set]")) {
      if (!visible(group) || group.closest("[data-b35-allow-formula-style]")) continue;
      const peers = [...contexts].filter((node) => !node.closest("[data-b35-allow-formula-style]") && group.contains(node) && node.closest(settings.peerSelectors || ".steps-col,.practice-answers,[data-b35-formula-set]") === group);
      const measurements = peers.map((node) => {
        const first = atoms(node).find((value) => value.semantic || /[\d=+−×÷%％a-z]/i.test(value.text));
        return first ? { selector: selector(node), family: family(first.node), size: fontSize(first.node) } : null;
      }).filter(Boolean);
      if (measurements.length < 2) continue;
      const families = [...new Set(measurements.map((item) => item.family))];
      if (families.length > 1) emit("B35-MATH-006", typographySeverity, "Related formula rows use different computed font families.", group, { kind: "peer-formula-family", measurements });
      const sizes = measurements.map((item) => item.size).filter((size) => size > 0);
      if (Math.max(...sizes) / Math.min(...sizes) > sizeRatio + 0.01) emit("B35-MATH-007", typographySeverity,
        "Related formula rows use inconsistent base font sizes.", group, { kind: "peer-formula-size", measurements, maximumRatio: sizeRatio });
    }

    for (const fraction of slide.querySelectorAll("mfrac")) {
      if (!shown(fraction) || fraction.closest("[data-b35-allow-empty-math]")) continue;
      if (fraction.children.length !== 2 || [...fraction.children].some((part) => !part.textContent.trim() && !part.querySelector("mglyph"))) {
        emit("B35-MATH-011", config.policy.malformedMathSeverity || "error", "Fraction needs exactly two non-empty parts: numerator and denominator.", fraction, { kind: "malformed-fraction", childCount: fraction.children.length });
      } else if (!fraction.closest("[data-b35-allow-formula-style]")) {
        const parts = [...fraction.children];
        const partTokens = parts.flatMap(baseMathTokens);
        const sizes = partTokens.map(fontSize);
        if (Math.max(...sizes) / Math.min(...sizes) > sizeRatio + 0.01) emit("B35-MATH-007", typographySeverity,
          "Numerator and denominator use inconsistent base font sizes.", fraction, { kind: "fraction-part-size", sizes });
        if (new Set(partTokens.map(family)).size > 1) emit("B35-MATH-006", typographySeverity,
          "Numerator and denominator use different computed font families.", fraction, { kind: "fraction-part-family", families: partTokens.map(family) });
      }
    }
    for (const error of slide.querySelectorAll("merror,.katex-error,mjx-merror,.MathJax_Error")) {
      if (visible(error)) emit("B35-MATH-011", config.policy.malformedMathSeverity || "error", "Math renderer displays an error.", error, { kind: "math-renderer-error", text: error.textContent.trim().slice(0, 120) });
    }
    for (const formula of slide.querySelectorAll(semantic)) {
      if (!visible(formula) || formula.parentElement.closest(semantic)) continue;
      const box = ink(formula);
      for (let ancestor = formula.parentElement; ancestor && ancestor !== slide.parentElement; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
        const clipsY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const boundary = ancestor.getBoundingClientRect();
        const excess = { left: boundary.left - box.left, right: box.right - boundary.right, top: boundary.top - box.top, bottom: box.bottom - boundary.bottom };
        if ((clipsX && Math.max(excess.left, excess.right) > clipTolerance) || (clipsY && Math.max(excess.top, excess.bottom) > clipTolerance)) {
          emit("B35-MATH-012", config.policy.formulaClippingSeverity || "error", "Formula ink extends beyond a clipping or scrolling ancestor.", formula,
            { kind: "formula-clipping", ancestor: selector(ancestor), excessPx: excess, formulaBox: box, ancestorBox: union([boundary]) });
          break;
        }
      }
    }
  }
  return issues;
}

module.exports = { auditFormulaStyles };
