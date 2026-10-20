"use strict";

// Self-contained so Playwright can serialize this function into the page.
function auditSvgFormulas(config) {
  const issues = [];
  const slides = [...document.querySelectorAll(config.selectors.slides)];
  const collisionTolerance = config.thresholds.svgFormulaOverlapTolerancePx ?? 2;
  const axisTolerance = config.thresholds.svgFormulaAxisTolerancePx ?? 6;
  const minimumOverlapRatio = config.thresholds.svgFormulaMinimumOverlapRatio ?? 0.1;
  const visible = (node) => {
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
    }
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const boxOf = (node) => {
    // Include MathML ink extents, which can exceed the math CSS line box.
    const boxes = [node, ...node.querySelectorAll("mfrac,mrow,mn,mi,mo,msup,msub,msqrt")]
      .map((item) => item.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
    const left = Math.min(...boxes.map((box) => box.left));
    const right = Math.max(...boxes.map((box) => box.right));
    const top = Math.min(...boxes.map((box) => box.top));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const pathFor = (node) => {
    if (node.id) return `#${node.id}`;
    const parts = [];
    for (let current = node; current && parts.length < 5; current = current.parentElement) {
      const siblings = current.parentElement ? [...current.parentElement.children].filter((child) => child.localName === current.localName) : [];
      parts.unshift(`${current.localName}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`);
      if (current.id) { parts[0] = `#${current.id}`; break; }
    }
    return parts.join(" > ");
  };
  for (const slide of slides.filter((item) => config.documentMode || item.classList.contains("active"))) {
    const push = (severity, message, element, evidence) => issues.push({
      rule: "B35-MATH-005", severity, message, slide: slide.id,
      runtimeSlide: slides.indexOf(slide) + 1,
      header: (slide.querySelector(config.selectors.header)?.textContent || "").trim(),
      selector: pathFor(element), evidence
    });
    for (const svg of slide.querySelectorAll("svg")) {
      if (!visible(svg)) continue;
      // A conversion group is a shared SVG parent of text fragments and one
      // or more foreignObject elements containing HTML/MathML formula tokens.
      const groups = new Set([...svg.querySelectorAll("foreignObject")]
        .filter((item) => item.querySelector("math,.frac,.root"))
        .map((item) => item.parentElement));
      for (const group of groups) {
        if (group.closest("[data-b35-allow-math-overlap]")) continue;
        const texts = [...group.children].filter((item) => item.localName === "text" && item.textContent.trim() && visible(item));
        const formulas = [...group.children].filter((item) => item.localName === "foreignObject")
          .flatMap((item) => [...item.querySelectorAll("math,.frac,.root")])
          .filter((item) => !item.parentElement.closest("math,.frac,.root") && visible(item));
        const tokens = [...texts, ...formulas];
        for (let i = 0; i < tokens.length; i++) {
          for (let j = i + 1; j < tokens.length; j++) {
            if (!formulas.includes(tokens[i]) && !formulas.includes(tokens[j])) continue;
            const a = boxOf(tokens[i]), b = boxOf(tokens[j]);
            const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            const overlapRatio = Math.max(0, width) * Math.max(0, height) / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
            if (width > collisionTolerance && height > collisionTolerance && overlapRatio >= minimumOverlapRatio) {
              push(config.policy.svgFormulaCollisionSeverity || "error",
                `SVG formula tokens overlap by ${width.toFixed(1)} × ${height.toFixed(1)}px.`, tokens[j], {
                  kind: "token-overlap", otherSelector: pathFor(tokens[i]),
                  tokenText: tokens[j].getAttribute("aria-label") || tokens[j].textContent.trim(),
                  otherText: tokens[i].getAttribute("aria-label") || tokens[i].textContent.trim(),
                  overlapWidthPx: width, overlapHeightPx: height, overlapRatio, tokenBox: b, otherBox: a
                });
            }
          }
        }
        if (group.closest("[data-b35-allow-math-offset]")) continue;
        // Compare a fraction bar to the actual '=' glyph's centre, rather than
        // comparing numerator/denominator baselines, which differ by design.
        const references = [];
        for (const text of texts) {
          const style = getComputedStyle(text);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = context.measureText("=");
          const glyphAxis = (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
          for (let index = 0; index < text.getNumberOfChars(); index++) {
            if (text.textContent[index] !== "=") continue;
            const origin = text.getStartPositionOfChar(index);
            const matrix = text.getScreenCTM();
            if (!matrix) continue;
            const point = new DOMPoint(origin.x, origin.y + glyphAxis).matrixTransform(matrix);
            references.push({ axisY: point.y, selector: pathFor(text), text: text.textContent.trim() });
          }
        }
        for (const formula of formulas) {
          const fraction = formula.querySelector("mfrac");
          if (!fraction || fraction.children.length < 2 || !references.length) continue;
          const numerator = boxOf(fraction.children[0]);
          const denominator = boxOf(fraction.children[1]);
          const fractionAxisY = (numerator.bottom + denominator.top) / 2;
          // At an unmarked SVG root there can be several independent rows.
          // Check axes automatically only for a shared g or an explicit row.
          if (group.localName !== "g" && !group.hasAttribute("data-b35-formula-row")) continue;
          const reference = references.reduce((best, item) => Math.abs(item.axisY - fractionAxisY) < Math.abs(best.axisY - fractionAxisY) ? item : best);
          const offset = fractionAxisY - reference.axisY;
          if (Math.abs(offset) > axisTolerance) push(config.policy.svgFormulaAxisSeverity || "warning",
            `Fraction bar is ${Math.abs(offset).toFixed(1)}px ${offset > 0 ? "below" : "above"} the neighbouring equals-sign axis.`, formula, {
              kind: "fraction-axis-offset", fractionAxisY, referenceAxisY: reference.axisY,
              offsetPx: offset, tolerancePx: axisTolerance, referenceSelector: reference.selector,
              tokenText: formula.getAttribute("aria-label") || formula.textContent.trim()
            });
        }
      }
    }
  }
  return issues;
}

module.exports = { auditSvgFormulas };
