"use strict";

// Self-contained: Playwright evaluates this against each settled reveal state.
function auditVisualModels(config) {
  const issues = [];
  const slides = [...document.querySelectorAll(config.selectors.slides)];
  const thresholds = config.thresholds;
  const shown = (node) => {
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
    }
    return true;
  };
  const visible = (node) => shown(node) && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  const selector = (node) => {
    const parts = [];
    for (let current = node; current && parts.length < 9; current = current.parentElement) {
      if (current.id) { parts.unshift(`#${current.id}`); break; }
      const siblings = current.parentElement ? [...current.parentElement.children].filter((other) => other.localName === current.localName) : [];
      parts.unshift(`${current.localName}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`);
    }
    return parts.join(" > ");
  };
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const scaleFor = (node) => {
    const svgNode = node.closest("foreignObject") || (node.namespaceURI === "http://www.w3.org/2000/svg" ? node : null);
    const matrix = svgNode?.getScreenCTM?.();
    if (matrix) return Math.hypot(matrix.a, matrix.b);
    const slide = node.closest(config.selectors.slides);
    return slide?.offsetWidth ? slide.getBoundingClientRect().width / slide.offsetWidth : 1;
  };
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const digitHeight = (node) => {
    const style = getComputedStyle(node);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText("0123456789");
    return (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * scaleFor(node);
  };
  const unionArea = (boxes) => {
    const xs = [...new Set(boxes.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 1; i < xs.length; i++) {
      const intervals = boxes.filter((box) => box.left < xs[i] && box.right > xs[i - 1]).map((box) => [box.top, box.bottom]).sort((a, b) => a[0] - b[0]);
      let covered = 0, end = -Infinity;
      for (const [top, bottom] of intervals) {
        covered += Math.max(0, bottom - Math.max(top, end));
        end = Math.max(end, bottom);
      }
      area += (xs[i] - xs[i - 1]) * covered;
    }
    return area;
  };
  const contentBoxes = (panel) => {
    const boundary = panel.getBoundingClientRect();
    const boxes = [];
    const append = (rect) => {
      const box = { left: Math.max(rect.left, boundary.left), right: Math.min(rect.right, boundary.right), top: Math.max(rect.top, boundary.top), bottom: Math.min(rect.bottom, boundary.bottom) };
      if (box.right > box.left && box.bottom > box.top) boxes.push(box);
    };
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !visible(node.parentElement) || node.parentElement.closest("script,style,.hi-wm,.nav,[data-b35-ignore-composition]")) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) append(rect);
    }
    for (const node of panel.querySelectorAll("svg rect,svg path,svg line,svg circle,svg ellipse,svg polygon,svg polyline,svg image,img,canvas")) {
      if (!visible(node) || node.closest(".hi-wm,[data-b35-ignore-composition]")) continue;
      const rect = node.getBoundingClientRect();
      // Ignore a bare canvas-sized background rectangle, but count the actual
      // bar/model shapes. CSS card backgrounds never count as teaching content.
      const svg = node.closest("svg");
      const svgBox = svg?.getBoundingClientRect();
      if (node.localName === "rect" && svgBox && rect.width * rect.height > 0.95 * svgBox.width * svgBox.height && getComputedStyle(node).stroke === "none") continue;
      append(rect);
    }
    return boxes;
  };

  for (const slide of slides.filter((node) => node.classList.contains("active"))) {
    const emit = (rule, severity, message, node, evidence) => {
      if (severity === "off") return;
      issues.push({ rule, severity, message, slide: slide.id, runtimeSlide: slides.indexOf(slide) + 1,
        header: (slide.querySelector(config.selectors.header)?.textContent || "").trim(), selector: selector(node), evidence });
    };

    // B35-MATH-014: actual numeric MathML glyph boxes, not just the root CSS
    // size. Structural script reduction is allowed above a readable ink floor.
    const fractionSamples = new Map();
    for (const fraction of slide.querySelectorAll("mfrac")) {
      if (!visible(fraction) || fraction.closest("[data-b35-allow-optical-size]")) continue;
      const digits = [...fraction.querySelectorAll("mn")].filter((digit) => visible(digit) && /\d/.test(digit.textContent) && !digit.closest("msup,msub,msubsup,mroot"));
      if (!digits.length) continue;
      const heights = digits.map((digit) => digit.getBoundingClientRect().height);
      const svgReference = fraction.closest("foreignObject")?.parentElement?.querySelector(":scope > text");
      const block = fraction.closest(".formula,.work,.prompt,.step-solution,.practice-answer,[data-b35-formula]") || fraction.closest("math").parentElement;
      const reference = svgReference || block;
      const referenceHeight = digitHeight(reference);
      const minHeight = Math.min(...heights), midHeight = median(heights);
      const ratio = referenceHeight > 0 ? midHeight / referenceHeight : null;
      const sample = { fractionSelector: selector(fraction), minimumDigitBoxPx: minHeight, medianDigitBoxPx: midHeight,
        referenceDigitInkEstimatePx: referenceHeight, relativeHeight: ratio, text: fraction.closest("math")?.getAttribute("aria-label") || fraction.textContent };
      if (!fractionSamples.has(block)) fractionSamples.set(block, []);
      fractionSamples.get(block).push(sample);
    }
    for (const [block, samples] of fractionSamples) {
      const tiny = samples.filter((sample) => sample.minimumDigitBoxPx < (thresholds.opticalFractionMinimumInkHeightPx ?? 7)
        || (sample.relativeHeight !== null && sample.relativeHeight < (thresholds.opticalFractionMinimumRelativeHeight ?? 0.6)));
      const medians = samples.map((sample) => sample.medianDigitBoxPx);
      const fractionRatio = Math.max(...medians) / Math.min(...medians);
      if (tiny.length || fractionRatio > (thresholds.opticalFractionMaximumPeerRatio ?? 1.4)) emit("B35-MATH-014", config.policy.opticalSizeSeverity || "warning",
        `Review fraction glyph sizes: ${tiny.length} fraction(s) fall below the optical readability limits; peer-size ratio is ${fractionRatio.toFixed(2)}.`, block,
        { kind: "fraction-optical-size", measurements: samples, smallFractionCount: tiny.length, peerSizeRatio: fractionRatio,
          minimumInkHeightPx: thresholds.opticalFractionMinimumInkHeightPx ?? 7, minimumRelativeHeight: thresholds.opticalFractionMinimumRelativeHeight ?? 0.6 });
    }

    // B35-DIAGRAM-001: strict reviewer-declared fraction bars; conservative
    // warnings for simple unannotated bars with an explicit in-shade fraction.
    for (const svg of slide.querySelectorAll("svg")) {
      if (!visible(svg) || svg.closest("[data-b35-ignore-diagram-model]")) continue;
      const declared = (config.diagramModels || []).find((model) => svg.matches(model.selector));
      const hasAttributes = svg.getAttribute("data-b35-diagram") === "fraction-bar";
      const model = declared || (hasAttributes ? { type: "fraction-bar", numerator: Number(svg.getAttribute("data-b35-numerator")), denominator: Number(svg.getAttribute("data-b35-denominator")), orientation: svg.getAttribute("data-b35-orientation") || "horizontal", requireEqualParts: svg.getAttribute("data-b35-require-parts") !== "false" } : null);
      if (model && model.type !== "fraction-bar") continue;
      const strict = Boolean(model);
      const rects = [...svg.querySelectorAll("rect")].filter(visible);
      const whole = model?.wholeSelector ? svg.querySelector(model.wholeSelector) : svg.querySelector("[data-b35-whole]") || rects.reduce((best, rect) => {
        const box = rect.getBoundingClientRect(), old = best?.getBoundingClientRect();
        return !old || box.width * box.height > old.width * old.height ? rect : best;
      }, null);
      if (!whole || !visible(whole)) {
        if (strict) emit("B35-DIAGRAM-001", "error", "Declared fraction bar has no measurable whole rectangle.", svg, { kind: "missing-model-geometry" });
        continue;
      }
      const boundary = whole.getBoundingClientRect();
      const vertical = model?.orientation === "vertical";
      if (!strict && boundary.width / boundary.height < 2) continue;
      const start = vertical ? boundary.top : boundary.left;
      const end = vertical ? boundary.bottom : boundary.right;
      const length = end - start;
      const crossLength = vertical ? boundary.width : boundary.height;
      const tolerance = thresholds.diagramGeometryTolerancePx ?? 2;
      const matchesBar = (rect) => {
        const box = rect.getBoundingClientRect();
        return box.left >= boundary.left - tolerance && box.right <= boundary.right + tolerance && box.top >= boundary.top - tolerance && box.bottom <= boundary.bottom + tolerance
          && Math.abs((vertical ? box.width : box.height) - crossLength) <= tolerance;
      };
      const shadeSelector = model?.shadedSelector || "[data-b35-shaded]";
      let shades = [...svg.querySelectorAll(shadeSelector)].filter(visible);
      if (!shades.length && !model?.shadedSelector) shades = rects.filter((rect) => rect !== whole && matchesBar(rect)
        && getComputedStyle(rect).fill !== getComputedStyle(whole).fill && getComputedStyle(rect).fill !== "none");
      const labels = [...svg.querySelectorAll("math[aria-label],text")].filter(visible).map((node) => {
        const value = node.getAttribute("aria-label") || node.textContent;
        const match = /^\s*(\d+)\s*(?:\/|over)\s*(\d+)\s*$/i.exec(value);
        return match ? { node, numerator: Number(match[1]), denominator: Number(match[2]) } : null;
      }).filter(Boolean);
      const shadeLabel = labels.find((label) => {
        const box = label.node.getBoundingClientRect(), x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
        return shades.some((shade) => { const rect = shade.getBoundingClientRect(); return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; });
      });
      if (!strict && (!shadeLabel || !shades.length || !shades.every(matchesBar))) continue;
      const numerator = strict ? model.numerator : shadeLabel.numerator;
      const denominator = strict ? model.denominator : shadeLabel.denominator;
      if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0 || numerator < 0 || numerator > denominator) {
        emit("B35-DIAGRAM-001", strict ? "error" : "warning", "Fraction-bar model needs integers with 0 ≤ numerator ≤ denominator and denominator > 0.", svg, { kind: "invalid-model", numerator, denominator });
        continue;
      }
      const severity = strict ? (config.policy.diagramModelSeverity || "error") : (config.policy.inferredDiagramSeverity || "warning");
      const report = (kind, message, evidence) => emit("B35-DIAGRAM-001", severity, message, svg, { kind, source: strict ? "declared model" : "inferred from a fraction label; requires review", numerator, denominator, ...evidence });
      if (strict && shades.some((shade) => !matchesBar(shade))) report("invalid-shade-geometry", "Declared shaded rectangles do not fit the whole bar's cross-section.", {});
      const intervals = shades.map((shade) => { const box = shade.getBoundingClientRect(); return [Math.max(start, vertical ? box.top : box.left), Math.min(end, vertical ? box.bottom : box.right)]; }).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      let shadedLength = 0, lastEnd = -Infinity;
      for (const [a, b] of intervals) { shadedLength += Math.max(0, b - Math.max(a, lastEnd)); lastEnd = Math.max(lastEnd, b); }
      const actualRatio = shadedLength / length, expectedRatio = numerator / denominator;
      if (Math.abs(actualRatio - expectedRatio) > (thresholds.diagramFractionRatioTolerance ?? 0.02)) report("shaded-ratio-mismatch",
        `Shaded bar occupies ${(actualRatio * 100).toFixed(1)}%; the ${strict ? "declared fraction" : "in-shade label"} ${numerator}/${denominator} implies ${(expectedRatio * 100).toFixed(1)}%.`, { actualRatio, expectedRatio });
      const cuts = [start, end];
      const addSegment = (node, x1, y1, x2, y2) => {
        const matrix = node.getScreenCTM(); if (!matrix) return;
        const a = new DOMPoint(x1, y1).matrixTransform(matrix), b = new DOMPoint(x2, y2).matrixTransform(matrix);
        if (!vertical && Math.abs(a.x - b.x) <= tolerance && Math.abs(Math.min(a.y, b.y) - boundary.top) <= tolerance && Math.abs(Math.max(a.y, b.y) - boundary.bottom) <= tolerance) cuts.push(a.x);
        if (vertical && Math.abs(a.y - b.y) <= tolerance && Math.abs(Math.min(a.x, b.x) - boundary.left) <= tolerance && Math.abs(Math.max(a.x, b.x) - boundary.right) <= tolerance) cuts.push(a.y);
      };
      for (const line of svg.querySelectorAll("line")) if (shown(line)) addSegment(line, Number(line.getAttribute("x1")), Number(line.getAttribute("y1")), Number(line.getAttribute("x2")), Number(line.getAttribute("y2")));
      for (const path of svg.querySelectorAll("path")) if (shown(path)) {
        // Intentionally narrow: only simple absolute M x y V y / H x dividers.
        const d = path.getAttribute("d") || "";
        const number = "(-?\\d+(?:\\.\\d+)?)";
        for (const match of d.matchAll(new RegExp(`M\\s*${number}[,\\s]+${number}\\s*([VH])\\s*${number}`, "g"))) {
          const x = Number(match[1]), y = Number(match[2]), value = Number(match[4]);
          addSegment(path, x, y, match[3] === "H" ? value : x, match[3] === "V" ? value : y);
        }
      }
      const partSelector = model?.partSelector || "[data-b35-part]";
      for (const part of [...svg.querySelectorAll(partSelector), ...shades]) {
        if (!visible(part)) continue;
        const box = part.getBoundingClientRect(); cuts.push(vertical ? box.top : box.left, vertical ? box.bottom : box.right);
      }
      const sortedCuts = cuts.filter((cut) => cut >= start - tolerance && cut <= end + tolerance).sort((a, b) => a - b);
      const positions = [];
      const cutTolerance = Math.min(tolerance, length / denominator * 0.1);
      for (const cut of sortedCuts) if (!positions.length || cut - positions.at(-1) > cutTolerance) positions.push(cut);
      const widths = positions.slice(1).map((cut, index) => cut - positions[index]);
      if (model?.requireEqualParts !== false) {
        const count = widths.length;
        const maxDeviation = Math.max(...widths.map((width) => Math.abs(width - length / denominator)));
        if (count !== denominator || maxDeviation > Math.min(tolerance, length / denominator * 0.05)) report("partition-mismatch",
          `Bar has ${count} measured partition(s); expected ${denominator} equal parts.`, { actualParts: count, expectedParts: denominator, measuredWidthsPx: widths, maximumDeviationPx: maxDeviation });
      }
      if (strict) {
        const labelSelector = model.labelSelector || "[data-b35-fraction-label]";
        const explicitLabel = svg.querySelector(labelSelector);
        if (explicitLabel) {
          const labelled = labels.find((label) => label.node === explicitLabel || explicitLabel.contains(label.node));
          if (!labelled || labelled.numerator * denominator !== numerator * labelled.denominator) report("declared-label-mismatch", "Marked aggregate fraction label does not match the declared shaded fraction.", { label: explicitLabel.textContent, expectedFraction: `${numerator}/${denominator}` });
        }
      }
    }

    // B35-COMPOSITION-001 is a review heuristic. Empty initial answer panels
    // are intentional, so inspect density only at the final reveal.
    const state = /Step\s+(\d+)\s*\/\s*(\d+)/i.exec(document.querySelector("#step")?.textContent || "");
    if (state && Number(state[1]) < Number(state[2])) continue;
    const slideBox = slide.getBoundingClientRect(), slideArea = slideBox.width * slideBox.height;
    const panels = slide.querySelectorAll(config.composition?.panelSelectors || ".visual-card,.formula-panel,.card,.summary-card,[data-b35-composition-panel]");
    for (const panel of panels) {
      if (!visible(panel) || panel.closest("[data-b35-allow-empty-space]")) continue;
      const box = panel.getBoundingClientRect(), area = box.width * box.height;
      if (area / slideArea < (thresholds.compositionMinimumPanelAreaRatio ?? 0.15)) continue;
      const boxes = contentBoxes(panel), occupied = unionArea(boxes) / area;
      if (occupied < (thresholds.compositionMinimumContentOccupancy ?? 0.3)) emit("B35-COMPOSITION-001", config.policy.compositionSeverity || "warning",
        `Content boxes occupy ${(occupied * 100).toFixed(1)}% of this large panel; review unused space and teaching purpose.`, panel,
        { kind: "low-panel-occupancy", occupancyRatio: occupied, panelAreaRatio: area / slideArea, measuredContentAreaPx: unionArea(boxes), panelAreaPx: area });
    }
    for (const group of slide.querySelectorAll(config.composition?.columnSelectors || ".two,.concept-board,.practice-grid,.paired-practice,[data-b35-composition-columns]")) {
      if (!visible(group) || group.closest("[data-b35-allow-empty-space]")) continue;
      for (const column of [...group.children].filter(visible)) {
        if (column.closest("[data-b35-allow-empty-space]")) continue;
        const box = column.getBoundingClientRect(), boxes = contentBoxes(column);
        if (!boxes.length || box.height < slideBox.height * 0.5) continue;
        const bottomGapRatio = (box.bottom - Math.max(...boxes.map((item) => item.bottom))) / box.height;
        if (bottomGapRatio > (thresholds.compositionMaximumBottomWhitespaceRatio ?? 0.4)) emit("B35-COMPOSITION-001", config.policy.compositionSeverity || "warning",
          `Teaching content leaves ${(bottomGapRatio * 100).toFixed(1)}% of this column's height unused below it.`, column,
          { kind: "column-bottom-whitespace", bottomWhitespaceRatio: bottomGapRatio, columnHeightPx: box.height });
      }
    }
  }
  return issues;
}

module.exports = { auditVisualModels };
