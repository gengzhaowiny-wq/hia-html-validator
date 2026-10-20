"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { auditSvgFormulas } = require("../src/rules/svg-formula-rules.cjs");
const config = require("../config/b35.rules.json");

function fixture({ x = 150, y = 67, hidden = false, scale = 1, allowOverlap = false } = {}) {
  return `<!doctype html><html><body style="margin:0"><section class="slide active" id="fixture"><div class="hdr">Formula regression fixture</div>
    <svg width="${600 * scale}" height="${200 * scale}" viewBox="0 0 600 200">
      <g ${hidden ? 'style="visibility:hidden"' : ""} ${allowOverlap ? "data-b35-allow-math-overlap" : ""}>
        <text x="20" y="100" font-size="24">1% =</text>
        <foreignObject x="${x}" y="${y}" width="70" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;align-items:center;font-size:24px">
            <math aria-label="1 over 100"><mfrac><mn>1</mn><mn>100</mn></mfrac></math>
          </div>
        </foreignObject>
      </g>
    </svg></section></body></html>`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    async function check(name, html, verify) {
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(auditSvgFormulas, config);
      verify(findings);
      results.push({ name, passed: true, findings });
    }
    await check("aligned fraction does not fail", fixture(), (items) => assert.equal(items.length, 0));
    await check("fraction/text overlap fails", fixture({ x: 20 }), (items) => assert.ok(items.some((item) => item.severity === "error" && item.evidence.kind === "token-overlap")));
    await check("vertical fraction-axis offset warns", fixture({ y: 130 }), (items) => assert.ok(items.some((item) => item.severity === "warning" && item.evidence.kind === "fraction-axis-offset")));
    await check("hidden reveal content is ignored", fixture({ x: 20, hidden: true }), (items) => assert.equal(items.length, 0));
    await check("correct formula at a different SVG scale passes", fixture({ scale: 1.5 }), (items) => assert.equal(items.length, 0));
    await check("scaled collision is detected", fixture({ x: 20, scale: 1.5 }), (items) => assert.ok(items.some((item) => item.evidence.kind === "token-overlap")));
    await check("explicit overlap exemption is honoured", fixture({ x: 20, allowOverlap: true }), (items) => assert.equal(items.length, 0));

    const lessonArgument = process.argv.indexOf("--lesson");
    if (lessonArgument >= 0) {
      const { pathToFileURL } = require("node:url");
      const lesson = path.resolve(process.argv[lessonArgument + 1]);
      await page.goto(pathToFileURL(lesson).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      // Use the actual navigation instead of reconstructing page 3 from source.
      await page.locator("#next").click();
      await page.locator("#next").click();
      await page.evaluate(async () => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
      const findings = await page.evaluate(auditSvgFormulas, config);
      assert.ok(findings.some((item) => item.slide === "s3" && item.evidence.kind === "token-overlap"), "The real Chapter 7 page-3 collision must be detected");
      results.push({ name: "Chapter 7 page 3 real-world collision", passed: true, findings });
    }
    const outArgument = process.argv.indexOf("--out");
    if (outArgument >= 0) {
      const destination = path.resolve(process.argv[outArgument + 1]);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify({ passed: results.length, failed: 0, results }, null, 2) + "\n");
    }
    console.log(JSON.stringify({ passed: results.length, failed: 0, tests: results.map((item) => item.name) }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
