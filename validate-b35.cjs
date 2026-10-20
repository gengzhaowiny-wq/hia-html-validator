#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { auditSvgFormulas } = require("./svg-formula-rules.cjs");
const { auditFormulaStyles } = require("./formula-style-rules.cjs");
const { auditVisualModels } = require("./visual-model-rules.cjs");
const { auditVisualReview } = require("./visual-review-rules.cjs");
const { auditComplementaryChecks } = require("./complementary-rules.cjs");
const { capturePagePairState, auditAdjacentQuestionPages } = require("./page-pair-rules.cjs");

const MANUAL_GATES = [
  ["source-fidelity", "Source fidelity, wording, mathematics, answers and diagrams checked against the authoritative source."],
  ["teaching-order", "Task/situation → reasoning → answer order is pedagogically sound in every meaningful reveal."],
  ["question-treatment", "Student-attempt tasks have a distinct number chip and deep-navy task treatment; answers/workings are distinct."],
  ["page-economy", "Every surviving page has a distinct teaching purpose; no safe compaction opportunity remains."],
  ["canvas-composition", "Every captured page and reveal is visually composed, readable and free of accidental whitespace or crowding."],
  ["mathematical-layout", "Fractions, powers, radicals, signs, equals signs, units, diagrams and multi-line calculations were visually checked."],
  ["practice", "Practice, review and challenge retain answers, citations where relevant and intentional pause points."],
  ["runtime", "Every meaningful reveal was reviewed and automated failures were resolved or explicitly waived."],
  ["drive", "If uploaded: replacement was once, in place, with unchanged Drive ID and recorded metadata delta."]
];

function usage() {
  return `Usage:
  node validate-b35.cjs LESSON.html [--config b35.rules.json] [--out DIR]
                                    [--static-only] [--no-screenshots] [--offline]

Exit codes: 0 automated pass, 1 automated failure, 2 blocked/invalid run.`;
}

function parseArgs(argv) {
  const args = { file: null, config: path.join(__dirname, "b35.rules.json"), out: null, staticOnly: false, screenshots: true };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!args.file && !value.startsWith("--")) args.file = value;
    else if (value === "--config") args.config = argv[++i];
    else if (value === "--out") args.out = argv[++i];
    else if (value === "--static-only") args.staticOnly = true;
    else if (value === "--no-screenshots") args.screenshots = false;
    else if (value === "--offline") args.offline = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown or incomplete option: ${value}`);
  }
  return args;
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function stripTags(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
  return match ? match[2] : null;
}

function classTokens(tag) {
  return new Set((attrValue(tag, "class") || "").split(/\s+/).filter(Boolean));
}

function finding(rule, severity, message, details = {}) {
  return { rule, severity, message, ...details };
}

function extractSlides(source) {
  const slides = [];
  const regex = /<(section|div)\b([^>]*\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\3[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(source))) {
    const open = `<${match[1]}${match[2]}>`;
    const body = match[4];
    const headerMatch = /<[^>]+\bclass\s*=\s*(["'])[^"']*\bhdr\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i.exec(body);
    slides.push({
      id: attrValue(open, "id") || `source-slide-${slides.length + 1}`,
      classes: [...classTokens(open)],
      header: headerMatch ? stripTags(headerMatch[2]) : "",
      html: body,
      sourceIndex: slides.length + 1
    });
  }
  return slides;
}

function staticRuleShell(context) {
  const { source, slides } = context;
  const issues = [];
  if (!/^\s*<!doctype\s+html>/i.test(source)) issues.push(finding("B35-SOURCE-001", "error", "Missing HTML5 doctype."));
  if (!/<html\b[^>]*\blang\s*=\s*(["'])[^"']+\1/i.test(source)) issues.push(finding("B35-SOURCE-001", "error", "The <html> element needs a non-empty lang attribute."));
  if (!/<meta\b[^>]*charset\s*=\s*(["'])?utf-8\1?/i.test(source)) issues.push(finding("B35-SOURCE-001", "error", "Missing UTF-8 charset declaration."));
  if (!slides.length) issues.push(finding("B35-SOURCE-001", "error", "No .slide elements were found."));
  const missingShell = slides.filter((slide) => !/\bclass\s*=\s*(["'])[^"']*\bhdr\b/i.test(slide.html) || !/\bclass\s*=\s*(["'])[^"']*\bbody\b/i.test(slide.html));
  for (const slide of missingShell) {
    issues.push(finding("B35-SOURCE-001", "error", "Slide is missing .hdr or .body.", { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header }));
  }
  const ids = [...source.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) issues.push(finding("B35-SOURCE-001", "error", `Duplicate id: ${id}`, { selector: `#${id}` }));
    seen.add(id);
  }
  if (!/\bclass\s*=\s*(["'])[^"']*\bnav\b/i.test(source)) issues.push(finding("B35-SOURCE-001", "error", "No .nav element was found."));
  return issues;
}

function staticRuleScripts(context) {
  const issues = [];
  const scripts = [...context.source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    if (/\bsrc\s*=/.test(match[1])) return;
    try {
      new vm.Script(match[2], { filename: `${path.basename(context.file)}:inline-script-${index + 1}` });
    } catch (error) {
      issues.push(finding("B35-SOURCE-002", "error", `Inline script ${index + 1} does not parse: ${error.message}`, { script: index + 1 }));
    }
  });
  return issues;
}

function staticRuleRevealOrder(context) {
  const issues = [];
  for (const slide of context.slides) {
    const steps = [...slide.html.matchAll(/\bdata-step\s*=\s*(["'])([^"']+)\1/gi)].map((match) => Number(match[2]));
    if (!steps.length) continue;
    const invalid = steps.filter((step) => !Number.isInteger(step) || step < 1);
    if (invalid.length) issues.push(finding("B35-REVEAL-001", "error", `Reveal steps must be positive integers; found ${invalid.join(", ")}.`, { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header }));
    const ordered = steps.every((step, index) => index === 0 || step >= steps[index - 1]);
    if (!ordered) issues.push(finding("B35-REVEAL-001", "error", `Reveal steps are not in DOM order: ${steps.join(", ")}.`, { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header }));
    const unique = [...new Set(steps)].sort((a, b) => a - b);
    const expected = Array.from({ length: unique[unique.length - 1] || 0 }, (_, index) => index + 1);
    if (unique.join(",") !== expected.join(",")) issues.push(finding("B35-REVEAL-001", "error", `Reveal steps are not contiguous from 1: ${unique.join(", ")}.`, { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header }));
  }
  return issues;
}

function staticRuleFractions(context) {
  const issues = [];
  const legacy = countMatches(context.source, /\bclass\s*=\s*(["'])[^"']*\bfrac\b[^"']*\1/gi);
  const mathml = countMatches(context.source, /<mfrac\b/gi);
  if (legacy) {
    issues.push(finding("B35-MATH-001", context.config.policy.legacyFractionSourceSeverity, `${legacy} legacy .frac reference(s) remain in source. A browser run must prove they are replaced before acceptance.`, { evidence: { legacySourceCount: legacy, sourceMfracCount: mathml } }));
  }
  return issues;
}

function staticRuleTaskTreatment(context) {
  const issues = [];
  const cssCardWhite = /\.card\s*\{[^}]*\bbackground\s*:\s*(?:#fff(?:fff)?|white)\b/i.test(context.source);
  // Source scans cannot resolve the CSS cascade or wrappers created by scripts.
  // These are review candidates; only the browser can determine the final style.
  const runtimePairStyling = /\.paired-practice[^{}]*\.card\s*\{[^}]*\bbackground\s*:/i.test(context.source);
  for (const slide of context.slides) {
    const questionTags = countMatches(slide.html, />\s*QUESTION\s*\d+\s*</gi);
    const practiceCards = countMatches(slide.html, /\bclass\s*=\s*(["'])[^"']*\bpractice-question\b[^"']*\1/gi);
    const genericQuestionCards = countMatches(slide.html, /\bclass\s*=\s*(["'])[^"']*\bcard\b[^"']*\1[^>]*>[\s\S]{0,700}?>\s*QUESTION\s*\d+\s*</gi);
    if (questionTags && genericQuestionCards && cssCardWhite && practiceCards === 0) {
      const message = runtimePairStyling
        ? `${genericQuestionCards} numbered task card(s) depend on the runtime .paired-practice wrapper and its background override. Verify computed task styling in the browser; this is not a confirmed colour failure.`
        : `${genericQuestionCards} numbered task card(s) use .card, whose base background is white. Verify the final computed background in the browser before recording a task-colour failure.`;
      issues.push(finding("B35-TASK-001", "warning", message, { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header, evidence: { questionTags, genericQuestionCards, runtimePairStyling, requiresBrowserVerification: true } }));
    }
  }
  return issues;
}

function staticRulePageEconomyEvidence(context) {
  const answerPages = context.slides.filter((slide) => /\bpractice-answers\b/.test(slide.html) && /a$/i.test(slide.id));
  const hasRuntimeMerger = /function\s+mergeQuestionAnswerPages\s*\(/.test(context.source);
  if (answerPages.length && !hasRuntimeMerger) {
    return answerPages.map((slide) => finding("B35-PAGE-001", "warning", "Standalone answer page detected without a recognised runtime compaction function.", { slide: slide.id, sourceSlide: slide.sourceIndex, header: slide.header }));
  }
  return [];
}

const staticRuleRegistry = [
  staticRuleShell,
  staticRuleScripts,
  staticRuleRevealOrder,
  staticRuleFractions,
  staticRuleTaskTreatment,
  staticRulePageEconomyEvidence
];

function runtimeAuditFunction(config) {
  const issues = [];
  const active = [...document.querySelectorAll(`${config.selectors.slides}.active`)];
  const allSlides = [...document.querySelectorAll(config.selectors.slides)];
  const nav = document.querySelector(config.selectors.navigator);
  const tolerance = config.thresholds.geometryTolerancePx;
  const overlapTolerance = config.thresholds.overlapTolerancePx;

  const parseColor = (value) => {
    const match = /rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d*\.?\d+))?\)/.exec(value || "");
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])] : null;
  };
  const luminance = (rgb) => {
    const linear = rgb.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01 && rect.width > 0.5 && rect.height > 0.5;
  };
  const pathFor = (element) => {
    if (element.id) return `#${element.id}`;
    const classes = [...element.classList].slice(0, 3).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  };
  const effectiveBackground = (element) => {
    let current = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.backgroundImage && style.backgroundImage !== "none") return null;
      const color = parseColor(style.backgroundColor);
      if (color && color[3] > 0.98) return color;
      current = current.parentElement;
    }
    return [255, 255, 255, 1];
  };
  const overlap = (a, b) => {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return { width, height, area: Math.max(0, width) * Math.max(0, height) };
  };
  const headerText = (slide) => (slide.querySelector(config.selectors.header)?.textContent || "").replace(/\s+/g, " ").trim();
  const push = (rule, severity, message, element, evidence = {}) => {
    const slide = active[0];
    issues.push({
      rule,
      severity,
      message,
      slide: slide?.id || null,
      runtimeSlide: slide ? allSlides.indexOf(slide) + 1 : null,
      header: slide ? headerText(slide) : null,
      selector: element ? pathFor(element) : null,
      evidence
    });
  };

  if (active.length !== 1) push("B35-RUNTIME-001", "error", `Expected exactly one active slide; found ${active.length}.`, null);
  if (!active.length) return { issues, metadata: { runtimeSlides: allSlides.length } };
  const slide = active[0];
  const slideRect = slide.getBoundingClientRect();
  const runtimeSlide = allSlides.indexOf(slide) + 1;
  const stepText = document.querySelector("#step")?.textContent || "";
  const stepMatch = /Step\s+(\d+)\s*\/\s*(\d+)/i.exec(stepText);
  const step = stepMatch ? Number(stepMatch[1]) : 0;
  const maxStep = stepMatch ? Number(stepMatch[2]) : Math.max(0, ...[...slide.querySelectorAll(config.selectors.reveals)].map((node) => Number(node.dataset.step) || 0));
  const counter = document.querySelector("#counter")?.textContent || "";
  if (counter.trim() !== `${runtimeSlide} / ${allSlides.length}`) push("B35-RUNTIME-001", "error", `Navigator counter is “${counter.trim()}”; expected “${runtimeSlide} / ${allSlides.length}”.`, document.querySelector("#counter"));
  if (step < 0 || step > maxStep) push("B35-RUNTIME-001", "error", `Reveal counter is outside 0..${maxStep}.`, document.querySelector("#step"));

  const scrollTargets = [slide, ...slide.querySelectorAll(`${config.selectors.body}, ${config.selectors.panels}`)];
  for (const element of scrollTargets) {
    if (!visible(element) || element.closest(".hi-wm")) continue;
    const overflowX = element.scrollWidth - element.clientWidth;
    const overflowY = element.scrollHeight - element.clientHeight;
    if (overflowX > tolerance || overflowY > tolerance) {
      const style = getComputedStyle(element);
      const clips = [style.overflowX, style.overflowY].some((value) => ["hidden", "clip", "auto", "scroll"].includes(value));
      const mathLineBox = !clips && (element.matches("math") || element.querySelector("math"));
      push(mathLineBox ? "B35-MATH-004" : "B35-CANVAS-001", mathLineBox ? "warning" : "error", mathLineBox
        ? `Math ink extends beyond its CSS line box by ${Math.max(0, overflowX)}px horizontal and ${Math.max(0, overflowY)}px vertical; inspect neighbouring content and clipping ancestors.`
        : `Internal overflow is ${Math.max(0, overflowX)}px horizontal and ${Math.max(0, overflowY)}px vertical.`, element, { overflowX, overflowY, clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight });
    }
  }

  const panels = [...slide.querySelectorAll(config.selectors.panels)].filter((element) => visible(element) && !element.closest(".hi-wm"));
  for (const element of panels) {
    const rect = element.getBoundingClientRect();
    const outside = {
      left: slideRect.left - rect.left,
      right: rect.right - slideRect.right,
      top: slideRect.top - rect.top,
      bottom: rect.bottom - slideRect.bottom
    };
    if (Object.values(outside).some((value) => value > tolerance)) push("B35-CANVAS-002", "error", "Visible panel extends beyond a slide edge.", element, outside);
  }

  if (nav && visible(nav)) {
    const navRect = nav.getBoundingClientRect();
    for (const element of panels) {
      if (element === nav || element.contains(nav) || nav.contains(element)) continue;
      const hit = overlap(navRect, element.getBoundingClientRect());
      if (hit.width > config.thresholds.navigatorClearancePx && hit.height > config.thresholds.navigatorClearancePx) push("B35-CANVAS-003", "error", "Navigator overlaps visible teaching content.", element, hit);
    }
  }

  const parents = new Set(panels.map((element) => element.parentElement).filter(Boolean));
  for (const parent of parents) {
    const siblings = [...parent.children].filter((element) => panels.includes(element) && visible(element));
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        const a = siblings[i], b = siblings[j];
        if (a.contains(b) || b.contains(a)) continue;
        const aStyle = getComputedStyle(a), bStyle = getComputedStyle(b);
        if (aStyle.position === "absolute" || bStyle.position === "absolute") continue;
        const hit = overlap(a.getBoundingClientRect(), b.getBoundingClientRect());
        if (hit.width > overlapTolerance && hit.height > overlapTolerance) push("B35-CANVAS-004", "error", `Sibling panels collide by ${hit.width.toFixed(1)}×${hit.height.toFixed(1)}px.`, b, { with: pathFor(a), ...hit });
      }
    }
  }

  if (step === 0) {
    for (const answer of slide.querySelectorAll(config.selectors.answerElements)) {
      if (visible(answer)) push("B35-ORDER-001", "error", "Answer-side content is visible at the initial reveal.", answer);
    }
  }

  const taskCandidates = [...slide.querySelectorAll(config.selectors.taskCards)].filter((element) => {
    const label = (element.querySelector(".tag,.book,.challenge-title")?.textContent || "").trim();
    return element.matches(".practice-question,.qcard") || /QUESTION\s*\d+|TRY IT|PRACTICE|CHALLENGE/i.test(label);
  });
  for (const task of taskCandidates) {
    const style = getComputedStyle(task);
    const background = parseColor(style.backgroundColor);
    const darkSolid = background && luminance(background) < 0.20;
    const darkGradient = style.backgroundImage !== "none" && /gradient/i.test(style.backgroundImage) && luminance(parseColor(style.color) || [255, 255, 255]) > 0.6;
    if (!darkSolid && !darkGradient) push("B35-TASK-001", config.policy.taskCardStyleSeverity, "Student-attempt task is not presented on a deep-navy/dark task card.", task, { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color });
    const chip = task.querySelector(config.selectors.numberChips);
    if (!chip || !/\d+/.test(chip.textContent || "")) push("B35-TASK-001", config.policy.taskCardStyleSeverity, "Student-attempt task has no distinct numbered chip.", task);
  }

  const legacyFractions = [...slide.querySelectorAll(".frac")].filter(visible);
  if (legacyFractions.length) push("B35-MATH-001", config.policy.legacyFractionRuntimeSeverity, `${legacyFractions.length} visible legacy .frac element(s) remain after runtime rendering.`, legacyFractions[0], { count: legacyFractions.length });
  for (const math of slide.querySelectorAll("math, .frac, .root, .formula, .work")) {
    if (!visible(math)) continue;
    const rect = math.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) push("B35-MATH-002", "error", "Mathematical content has zero or near-zero rendered geometry.", math, { width: rect.width, height: rect.height });
    const fontSize = parseFloat(getComputedStyle(math).fontSize) || 0;
    if (fontSize && fontSize < config.thresholds.minimumReadableFontPx) push("B35-MATH-003", config.policy.minimumFontSeverity, `Math text is ${fontSize.toFixed(1)}px, below the configured ${config.thresholds.minimumReadableFontPx}px threshold.`, math, { fontSize });
  }

  for (const svg of slide.querySelectorAll("svg")) {
    if (!visible(svg)) continue;
    const rect = svg.getBoundingClientRect();
    if (!svg.getAttribute("viewBox")) push("B35-SVG-001", "error", "SVG is missing viewBox.", svg);
    const accessibleNameSeverity = config.policy.svgAccessibleNameSeverity ?? "off";
    if (accessibleNameSeverity !== "off" && !svg.getAttribute("aria-label") && !svg.getAttribute("aria-labelledby") && !svg.querySelector("title")) push("B35-SVG-001", accessibleNameSeverity, "SVG needs an aria-label, aria-labelledby or <title>.", svg);
    if (rect.width < 1 || rect.height < 1) push("B35-SVG-001", "error", "SVG has zero or near-zero rendered geometry.", svg, { width: rect.width, height: rect.height });
    for (const text of svg.querySelectorAll("text")) {
      if (!visible(text)) continue;
      const fontSize = parseFloat(getComputedStyle(text).fontSize) || 0;
      if (fontSize && fontSize < config.thresholds.minimumDiagramFontPx) push("B35-MATH-003", config.policy.minimumFontSeverity, `SVG label is ${fontSize.toFixed(1)}px, below the configured ${config.thresholds.minimumDiagramFontPx}px threshold.`, text, { fontSize, text: (text.textContent || "").trim().slice(0, 80) });
    }
  }

  for (const card of slide.querySelectorAll(".card, .visual-card, .summary-card, .step-solution")) {
    if (!visible(card)) continue;
    const rect = card.getBoundingClientRect();
    const areaRatio = (rect.width * rect.height) / Math.max(1, slideRect.width * slideRect.height);
    const textLength = (card.textContent || "").replace(/\s+/g, " ").trim().length;
    if (areaRatio >= config.thresholds.mostlyEmptyCardMinimumAreaRatio && textLength <= config.thresholds.mostlyEmptyCardMaximumTextCharacters && !card.querySelector("svg,img,math")) {
      push("B35-CANVAS-005", "warning", "Large card contains very little content; review for hollow-page compaction.", card, { areaRatio, textLength });
    }
  }

  const textCandidates = [...slide.querySelectorAll("h1,h2,h3,p,.formula,.prompt,.hint,.step-solution,.practice-answer,.diagram-caption,svg text")].filter((element) => visible(element) && (element.textContent || "").trim());
  for (const element of textCandidates) {
    // SVG rectangles/paths can paint the text background independently of the
    // ancestor CSS background. Without paint sampling its contrast is unknown.
    if (element.closest("svg")) continue;
    const style = getComputedStyle(element);
    const foreground = parseColor(element.tagName.toLowerCase() === "text" ? style.fill : style.color);
    const background = effectiveBackground(element);
    if (!foreground || !background) continue;
    const ratio = contrast(foreground, background);
    const fontSize = parseFloat(style.fontSize) || 0;
    const weight = Number(style.fontWeight) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const minimum = large ? config.thresholds.minimumContrastLarge : config.thresholds.minimumContrastNormal;
    if (ratio + 0.05 < minimum) push("B35-CONTRAST-001", config.policy.contrastSeverity, `Sampled contrast is ${ratio.toFixed(2)}:1; configured minimum is ${minimum}:1.`, element, { ratio, minimum, foreground: style.color || style.fill, background: background.slice(0, 3), fontSize, fontWeight: weight, text: (element.textContent || "").trim().slice(0, 100) });
  }

  return {
    issues,
    metadata: {
      runtimeSlides: allSlides.length,
      runtimeSlide,
      slideId: slide.id,
      header: headerText(slide),
      step,
      maxStep,
      legacyFractions: legacyFractions.length,
      mathMLFractions: slide.querySelectorAll("mfrac").length,
      taskCandidates: taskCandidates.length
    }
  };
}

async function runBrowserAudit(context) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (error) {
    return { blocked: true, reason: `Playwright is not installed: ${error.message}`, findings: [], states: [], screenshots: [] };
  }

  let browser;
  const findings = [];
  const states = [];
  const screenshots = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const pagePairStates = [];
  const screenshotDir = path.join(context.out, "screenshots");
  if (context.args.screenshots) fs.mkdirSync(screenshotDir, { recursive: true });
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: context.config.viewport, deviceScaleFactor: 1, acceptDownloads: false, serviceWorkers: "block" });
    page.on("dialog", dialog => dialog.dismiss().catch(() => {}));
    page.on("popup", popup => popup.close().catch(() => {}));
    if (context.args.offline) {
      await page.route(/^https?:/i, route => route.abort("blockedbyclient"));
      await page.routeWebSocket(/.*/, socket => socket.close());
    }
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText || "request failed" }));
    await page.goto(pathToFileURL(context.file).href, { waitUntil: "load", timeout: 15000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]);
    });

    let guard = 0;
    let previousKey = null;
    while (guard++ < 2000) {
      // A counter updates immediately, while reveal opacity and transforms
      // continue animating. Audit only after those animations have completed.
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const result = await page.evaluate(runtimeAuditFunction, context.config);
      result.issues.push(...await page.evaluate(auditSvgFormulas, context.config));
      result.issues.push(...await page.evaluate(auditFormulaStyles, context.config));
      result.issues.push(...await page.evaluate(auditVisualModels, context.config));
      result.issues.push(...await page.evaluate(auditVisualReview, context.config));
      result.issues.push(...await page.evaluate(auditComplementaryChecks, context.config));
      const meta = result.metadata;
      const stateKey = `${meta.runtimeSlide}:${meta.step}`;
      if (stateKey === previousKey) break;
      previousKey = stateKey;
      result.issues.forEach((item) => findings.push({ ...item, state: `${meta.step}/${meta.maxStep}` }));
      states.push(meta);
      if (meta.step === 0 && context.config.pagePairs?.enabled !== false) {
        pagePairStates.push(await page.evaluate(capturePagePairState, { config:context.config, metadata:meta }));
      }

      const captureTargets = new Set([0, Math.ceil(meta.maxStep / 2), meta.maxStep]);
      if (context.args.screenshots && captureTargets.has(meta.step)) {
        const label = meta.step === 0 ? "initial" : meta.step === meta.maxStep ? "final" : "middle";
        const filename = `${String(meta.runtimeSlide).padStart(3, "0")}-${(meta.slideId || "slide").replace(/[^a-z0-9_-]+/gi, "-")}-${label}-step-${meta.step}.jpg`;
        const destination = path.join(screenshotDir, filename);
        await page.screenshot({ path: destination, type: "jpeg", quality: context.config.capture.quality, fullPage: false });
        screenshots.push({ runtimeSlide: meta.runtimeSlide, slide: meta.slideId, header: meta.header, state: `${meta.step}/${meta.maxStep}`, label, file: path.relative(context.out, destination) });
      }

      const atEnd = meta.runtimeSlide === meta.runtimeSlides && meta.step === meta.maxStep;
      if (atEnd) break;
      await page.locator("#next").click();
    }
    if (guard >= 2000) findings.push(finding("B35-RUNTIME-001", "error", "Browser traversal exceeded 2000 states and was stopped."));
    findings.push(...auditAdjacentQuestionPages(pagePairStates, context.config));
    pageErrors.forEach((message) => findings.push(finding("B35-RUNTIME-002", "error", `Page exception: ${message}`)));
    consoleErrors.forEach((message) => findings.push(finding("B35-RUNTIME-002", "error", `Console error: ${message}`)));
    failedRequests.forEach((request) => findings.push(finding("B35-RUNTIME-002", context.config.policy.externalRequestFailureSeverity, `Resource failed to load: ${request.url}`, { evidence: request })));
    return { blocked: false, findings, states, screenshots, pagePairStates, runtime: states.at(-1)?.runtimeSlides || null, consoleErrors, pageErrors, failedRequests };
  } catch (error) {
    return { blocked: true, reason: error.message, findings, states, screenshots, pagePairStates, consoleErrors, pageErrors, failedRequests };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function dedupeFindings(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.rule, item.severity, item.slide, item.state, item.selector, item.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupByRule(findings) {
  const groups = new Map();
  for (const item of findings) {
    if (!groups.has(item.rule)) groups.set(item.rule, []);
    groups.get(item.rule).push(item);
  }
  return groups;
}

function reportMarkdown(report) {
  const lines = [];
  lines.push(`# B35 validation report — ${report.fileName}`, "");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Source file: \`${report.file}\``);
  lines.push(`- Source slides: **${report.metrics.sourceSlides}**`);
  lines.push(`- Expected runtime slides after recognised compaction: **${report.metrics.expectedRuntimeSlides}**`);
  lines.push(`- Observed runtime slides: **${report.metrics.runtimeSlides ?? "not run"}**`);
  lines.push(`- Reveal states inspected: **${report.metrics.revealStatesInspected}**`);
  lines.push(`- Automated errors: **${report.summary.errors}**`);
  lines.push(`- Automated warnings: **${report.summary.warnings}**`);
  lines.push(`- Browser stage: **${report.browser.status}**`);
  lines.push(`- Overall status: **${report.summary.overall}**`, "");
  if (report.browser.reason) lines.push(`> Browser stage was not completed: ${report.browser.reason.replace(/\s+/g, " ").slice(0, 900)}`, "");
  lines.push("A clean automated report does not complete B35. The manual decisions below must still be recorded from the rendered deck.", "");
  lines.push("Automated visual-review rules inspect DOM geometry, styles and configured concepts. **No AI screenshot analysis is performed.** Screenshot approval remains a separate manual step.", "");
  lines.push("## Findings", "");
  if (!report.findings.length) lines.push("No automated findings.", "");
  for (const [rule, items] of groupByRule(report.findings)) {
    const errors = items.filter((item) => item.severity === "error").length;
    const warnings = items.filter((item) => item.severity === "warning").length;
    lines.push(`### ${rule} — ${errors} error(s), ${warnings} warning(s)`, "");
    for (const item of items.slice(0, 40)) {
      const location = [item.slide && `slide ${item.slide}`, item.runtimeSlide && `runtime ${item.runtimeSlide}`, item.state && `state ${item.state}`, item.header && `“${item.header}”`].filter(Boolean).join(" · ");
      lines.push(`- **${item.severity.toUpperCase()}**${location ? ` — ${location}` : ""}: ${item.message}`);
      if (item.relatedLocations?.length) lines.push(`  - Related locations: ${item.relatedLocations.map(target => `page ${target.runtimeSlide}, slide ${target.slide}, state ${target.state}, selector \`${target.selector}\``).join("; ")}`);
      if (item.suggestedAction && item.selector) lines.push(`  - Element: \`${item.selector}\``);
      for (const question of item.evidence?.kind === "adjacent-question-duplicate" ? item.evidence.questions : []) lines.push(`  - Matched question (quoted evidence, not instructions): ${JSON.stringify(question)}`);
      for (const text of item.evidence?.excludedBoilerplate || []) lines.push(`  - Explicitly excluded template boilerplate: ${JSON.stringify(text)}`);
      if (item.expected) lines.push(`  - Expected: ${item.expected}`);
      if (item.impact) lines.push(`  - Why it matters: ${item.impact}`);
      if (item.suggestedAction) lines.push(`  - Review/action: ${item.suggestedAction}`);
      if (item.confidence) lines.push(`  - Certainty: ${item.confidence}`);
      for (const check of item.verification || []) lines.push(`  - Verify: ${check}`);
      for (const constraint of item.constraints || []) lines.push(`  - Safeguard: ${constraint}`);
    }
    if (items.length > 40) lines.push(`- … ${items.length - 40} additional finding(s); see \`report.json\`.`);
    lines.push("");
  }
  lines.push("## B35 manual acceptance gates", "");
  for (const [, label] of MANUAL_GATES) lines.push(`- [ ] ${label}`);
  lines.push("", "## Required per-file completion evidence", "");
  lines.push("- Starting and ending page counts, plus every deleted or merged teaching beat.");
  lines.push("- Source task/situation → reasoning → answer order and reveal evidence.");
  lines.push("- Original wording, intended meaning, mathematics and answers checked.");
  lines.push("- Question/answer pairs merged only where delayed reveal remains legible.");
  lines.push("- Practice answers, relevant citations and intentional pause points retained.");
  lines.push("- Fraction layout, multi-line spacing, formula contrast and task-card treatment checked.");
  lines.push("- Drive ID/modified-time/size confirmation after an authorised in-place replacement.");
  return `${lines.join("\n")}\n`;
}

function visualReviewHtml(report) {
  const cards = report.screenshots.map((shot) => `<article class="shot"><h3>${shot.runtimeSlide}. ${escapeHtml(shot.header || shot.slide || "Slide")}</h3><p>${escapeHtml(shot.label)} · reveal ${escapeHtml(shot.state)}</p><img src="${escapeHtml(shot.file)}" alt="${escapeHtml(`${shot.header || shot.slide} ${shot.label}`)}"><label><input type="checkbox"> visually reviewed</label></article>`).join("\n");
  const gates = MANUAL_GATES.map(([id, label]) => `<label class="gate"><input type="checkbox" id="${id}"> ${escapeHtml(label)}</label>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>B35 visual review — ${escapeHtml(report.fileName)}</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:0;background:#eef2f7;color:#172033}.wrap{max-width:1500px;margin:auto;padding:24px}h1{margin:0 0 8px}.notice{padding:14px;border-left:5px solid #b45309;background:#fff7ed}.gates{display:grid;gap:8px;margin:18px 0}.gate,.shot label{display:block;background:#fff;padding:10px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}.shot{background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 12px #0001}.shot h3{font-size:15px;margin:0}.shot p{font-size:12px;color:#5b6474}.shot img{width:100%;display:block;border:1px solid #ccd3dd}.shot label{margin-top:8px;background:#f7f9fc}.blocked{padding:24px;background:#fff;border:2px solid #b91c1c;color:#7f1d1d}</style></head>
<body><main class="wrap"><h1>B35 visual review — ${escapeHtml(report.fileName)}</h1><p class="notice">This gallery supports manual B35 review; it does not replace it. Automated visual-review rules inspect DOM geometry and configured concepts, not screenshot pixels. No AI image analysis is performed. Geometry checks visit every reveal state, while the gallery captures initial, middle and final states.</p><section class="gates">${gates}</section>${report.browser.status === "BLOCKED" ? `<p class="blocked">Browser stage blocked: ${escapeHtml(report.browser.reason || "unknown reason")}</p>` : `<section class="grid">${cards}</section>`}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message, "\n", usage());
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.file) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  const file = path.resolve(args.file);
  const configFile = path.resolve(args.config);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Lesson file does not exist: ${file}`);
  if (!fs.existsSync(configFile)) throw new Error(`Rule configuration does not exist: ${configFile}`);
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const source = fs.readFileSync(file, "utf8");
  const slides = extractSlides(source);
  const answerPages = slides.filter((slide) => /\bpractice-answers\b/.test(slide.html) && /a$/i.test(slide.id));
  const hasRuntimeMerger = /function\s+mergeQuestionAnswerPages\s*\(/.test(source);
  const expectedRuntimeSlides = slides.length - (hasRuntimeMerger ? answerPages.length : 0);
  const out = path.resolve(args.out || path.join(process.cwd(), `${path.basename(file, path.extname(file))}-b35-report`));
  fs.mkdirSync(out, { recursive: true });
  const context = { args, config, source, slides, file, out };
  let findings = [];
  for (const rule of staticRuleRegistry) findings.push(...rule(context));
  const browser = args.staticOnly ? { blocked: false, skipped: true, findings: [], states: [], screenshots: [], runtime: null } : await runBrowserAudit(context);
  findings.push(...browser.findings);
  if (!browser.blocked && !browser.skipped) {
    findings = findings.filter((item) => {
      if (!item.evidence?.requiresBrowserVerification) return true;
      const observed = browser.states.some((state) => state.slideId === item.slide && state.taskCandidates >= item.evidence.questionTags);
      const failed = browser.findings.some((candidate) => candidate.rule === item.rule && candidate.slide === item.slide);
      return !observed || failed;
    });
  }
  if (browser.blocked) findings.push(finding("B35-RUNTIME-000", "error", "Browser validation did not run; B35 final runtime check is incomplete.", { evidence: { reason: browser.reason } }));
  findings = dedupeFindings(findings);
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const browserStatus = args.staticOnly ? "SKIPPED BY --static-only" : browser.blocked ? "BLOCKED" : "COMPLETED";
  const overall = browser.blocked ? "BLOCKED — browser check incomplete" : errors ? "AUTOMATED FAIL — manual B35 acceptance prohibited" : args.staticOnly ? "SOURCE PREFLIGHT ONLY — browser/layout not validated" : "AUTOMATED PASS — manual B35 review still required";
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    file,
    fileName: path.basename(file),
    config: configFile,
    summary: { errors, warnings, overall, manualAcceptanceRequired: true },
    visualReviewCoverage: {
      automated: "Rendered DOM geometry, style and bounded vocabulary contracts",
      screenshotImageAnalysis: "NOT IMPLEMENTED — screenshots require separate visual review",
      manualApproval: "NOT REVIEWED"
    },
    metrics: {
      sourceSlides: slides.length,
      answerOnlySourcePagesRecognised: answerPages.length,
      expectedRuntimeSlides,
      runtimeSlides: browser.runtime,
      revealStatesInspected: browser.states.length,
      screenshotsCaptured: browser.screenshots.length,
      sourceLegacyFractionReferences: countMatches(source, /\bclass\s*=\s*(["'])[^"']*\bfrac\b[^"']*\1/gi),
      sourceMathMLFractions: countMatches(source, /<mfrac\b/gi)
    },
    browser: { status: browserStatus, reason: browser.reason || null, consoleErrors: browser.consoleErrors || [], pageErrors: browser.pageErrors || [], failedRequests: browser.failedRequests || [] },
    findings,
    states: browser.states,
    pagePairStates: browser.pagePairStates || [],
    screenshots: browser.screenshots,
    manualGates: MANUAL_GATES.map(([id, label]) => ({ id, label, status: "not reviewed" }))
  };
  fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "report.md"), reportMarkdown(report));
  fs.writeFileSync(path.join(out, "visual-review.html"), visualReviewHtml(report));
  console.log(JSON.stringify({ report: path.join(out, "report.md"), json: path.join(out, "report.json"), visualReview: path.join(out, "visual-review.html"), ...report.summary, browser: browserStatus, metrics: report.metrics }, null, 2));
  process.exitCode = browser.blocked ? 2 : errors ? 1 : 0;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 2;
});
