"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { auditVisualModels } = require("../src/rules/visual-model-rules.cjs");
const config = require("../config/b35.rules.json");

const fraction = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
const wrap = (content, style = "") => `<!doctype html><html><head><style>body{margin:0;font:24px Arial}.slide{width:960px;height:540px}math{font:inherit;display:inline-block}${style}</style></head><body><section class="slide active" id="fixture"><div class="hdr">Visual model regression</div>${content}</section></body></html>`;
function bar({ declared = true, shade = 2, numerator = 2, denominator = 7, partitions = 7, label = "2/7", pathCuts = false, vertical = false } = {}) {
  const width = vertical ? 60 : 350, height = vertical ? 350 : 60;
  const attrs = declared ? `data-b35-diagram="fraction-bar" data-b35-numerator="${numerator}" data-b35-denominator="${denominator}"` : "";
  const cuts = Array.from({ length: partitions - 1 }, (_, i) => (i + 1) * 350 / partitions);
  const lines = pathCuts ? `<path d="${cuts.map((cut) => `M${cut} 0V60`).join("")}" stroke="white"/>` : cuts.map((cut) => vertical
    ? `<line x1="0" y1="${cut}" x2="60" y2="${cut}" stroke="white"/>`
    : `<line x1="${cut}" y1="0" x2="${cut}" y2="60" stroke="white"/>`).join("");
  return `<svg id="model" ${attrs} width="400" height="400" viewBox="0 0 400 400">
    <rect data-b35-whole width="${width}" height="${height}" fill="cyan" stroke="black"/>
    <rect data-b35-shaded width="${vertical ? 60 : 350 * shade / denominator}" height="${vertical ? 350 * shade / denominator : 60}" fill="purple"/>
    ${lines}<text data-b35-fraction-label x="12" y="35" font-size="18" fill="white">${label}</text></svg>`;
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    async function check(name, html, verify, options = config) {
      await page.setContent(html); await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(auditVisualModels, options);
      verify(findings); results.push({ name, passed: true, findings });
    }
    const has = (items, kind) => items.some((item) => item.evidence.kind === kind);
    await check("readable ordinary fraction passes", wrap(`<div class="work">${fraction} = 0.5</div>`), (items) => assert.equal(has(items, "fraction-optical-size"), false));
    await check("tiny fraction numeric ink warns", wrap(`<div class="work">${fraction} = 0.5</div>`, ".work{font-size:10px}"), (items) => assert.equal(has(items, "fraction-optical-size"), true));
    await check("intentional optical exception is honoured", wrap(`<div class="work" data-b35-allow-optical-size>${fraction} = 0.5</div>`, ".work{font-size:10px}"), (items) => assert.equal(has(items, "fraction-optical-size"), false));
    await check("hidden tiny fraction is ignored", wrap(`<div class="work" style="visibility:hidden;font-size:8px">${fraction}</div>`), (items) => assert.equal(has(items, "fraction-optical-size"), false));
    await check("correct declared seven-part bar passes", wrap(bar()), (items) => assert.equal(items.some((item) => item.rule === "B35-DIAGRAM-001"), false));
    await check("wrong declared shaded proportion fails", wrap(bar({ shade: 1 })), (items) => assert.ok(items.some((item) => item.evidence.kind === "shaded-ratio-mismatch" && item.severity === "error")));
    await check("wrong declared partition count fails", wrap(bar({ partitions: 4 })), (items) => assert.equal(has(items, "partition-mismatch"), true));
    await check("wrong aggregate label fails", wrap(bar({ label: "1/7" })), (items) => assert.equal(has(items, "declared-label-mismatch"), true));
    await check("equivalent aggregate fraction is accepted", wrap(bar({ label: "4/14" })), (items) => assert.equal(has(items, "declared-label-mismatch"), false));
    await check("simple SVG path dividers are supported", wrap(bar({ pathCuts: true })), (items) => assert.equal(has(items, "partition-mismatch"), false));
    const vertical = structuredClone(config); vertical.diagramModels = [{ selector: "#model", type: "fraction-bar", numerator: 2, denominator: 7, orientation: "vertical" }];
    await check("vertical declared bar passes", wrap(bar({ vertical: true })), (items) => assert.equal(items.some((item) => item.rule === "B35-DIAGRAM-001"), false), vertical);
    await check("small partitions are not merged by pixel tolerance", wrap(bar({ shade: 25, numerator: 25, denominator: 100, partitions: 100, label: "25/100" })), (items) => assert.equal(has(items, "partition-mismatch"), false));
    await check("unequal parts fail even with the right count", wrap(bar().replace('x1="50"', 'x1="60"').replace('x2="50"', 'x2="60"')), (items) => assert.equal(has(items, "partition-mismatch"), true));
    const duplicateShade = bar().replace(/(<rect data-b35-shaded[^>]*\/>)/, "$1$1");
    await check("overlapping shaded rectangles are not counted twice", wrap(duplicateShade), (items) => assert.equal(has(items, "shaded-ratio-mismatch"), false));
    const transformedBar = bar().replace('<rect data-b35-whole', '<g transform="translate(15 15) scale(0.75)"><rect data-b35-whole').replace('</svg>', '</g></svg>');
    await check("transformed SVG bar geometry passes", wrap(transformedBar), (items) => assert.equal(items.some((item) => item.rule === "B35-DIAGRAM-001"), false));
    await check("invalid declared fraction fails", wrap(bar({ numerator: 9 })), (items) => assert.equal(has(items, "invalid-model"), true));
    await check("inferred wrong label only warns", wrap(bar({ declared: false, label: "1/7" })), (items) => {
      assert.ok(items.some((item) => item.evidence.kind === "shaded-ratio-mismatch" && item.severity === "warning"));
      assert.equal(items.some((item) => item.severity === "error"), false);
    });
    await check("correct inferred bar passes", wrap(bar({ declared: false })), (items) => assert.equal(has(items, "shaded-ratio-mismatch"), false));
    const missingWhole = bar().replace(/<rect data-b35-whole[^>]*\/>/, "");
    const configured = structuredClone(config); configured.diagramModels = [{ selector: "#model", type: "fraction-bar", numerator: 2, denominator: 7, wholeSelector: "[data-b35-whole]" }];
    await check("missing declared geometry fails", wrap(missingWhole), (items) => assert.equal(has(items, "missing-model-geometry"), true), configured);
    await check("empty large card warns", wrap('<div data-b35-composition-panel style="width:450px;height:420px">A short line.</div>'), (items) => assert.equal(has(items, "low-panel-occupancy"), true));
    await check("substantial graphic contributes to occupancy", wrap('<div data-b35-composition-panel style="width:450px;height:420px"><svg width="440" height="410"><rect x="10" y="10" width="420" height="390" fill="purple" stroke="black"/></svg></div>'), (items) => assert.equal(has(items, "low-panel-occupancy"), false));
    await check("empty intermediate reveal is not a density failure", wrap('<span id="step">Step 0 / 2</span><div data-b35-composition-panel style="width:450px;height:420px">Question</div>'), (items) => assert.equal(has(items, "low-panel-occupancy"), false));
    await check("deliberate writing space is exempt", wrap('<div data-b35-composition-panel data-b35-allow-empty-space style="width:450px;height:420px">Question</div>'), (items) => assert.equal(has(items, "low-panel-occupancy"), false));
    await check("unused column bottom warns", wrap('<div data-b35-composition-columns style="display:flex"><div style="width:450px;height:420px">Small working at the top.</div></div>'), (items) => assert.equal(has(items, "column-bottom-whitespace"), true));

    const lessonIndex = process.argv.indexOf("--lesson");
    if (lessonIndex >= 0) {
      await page.goto(pathToFileURL(path.resolve(process.argv[lessonIndex + 1])).href);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { let guard = 0; while (document.querySelector(".active")?.id !== "s15" && guard++ < 1000) next(); });
      const findings = await page.evaluate(auditVisualModels, config);
      assert.ok(findings.some((item) => item.runtimeSlide === 14 && item.rule === "B35-MATH-014"));
      assert.ok(findings.some((item) => item.runtimeSlide === 14 && item.evidence.kind === "shaded-ratio-mismatch" && item.severity === "warning"));
      assert.ok(findings.some((item) => item.runtimeSlide === 14 && item.evidence.kind === "partition-mismatch"));
      assert.ok(findings.some((item) => item.runtimeSlide === 14 && item.rule === "B35-COMPOSITION-001"));
      results.push({ name: "actual Chapter 7 page 14 triggers all three checks", passed: true, findings });
    }
    const outIndex = process.argv.indexOf("--out");
    if (outIndex >= 0) {
      const destination = path.resolve(process.argv[outIndex + 1]); fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify({ passed: results.length, failed: 0, results }, null, 2) + "\n");
    }
    console.log(JSON.stringify({ passed: results.length, failed: 0, tests: results.map((item) => item.name) }, null, 2));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
