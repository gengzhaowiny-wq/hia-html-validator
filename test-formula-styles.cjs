"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { auditFormulaStyles } = require("./formula-style-rules.cjs");
const config = require("./b35.rules.json");

const fraction = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
const wrap = (content, extra = "") => `<!doctype html><html><head><style>body,math{font-family:Arial;font-size:24px}math{display:inline-block}body{margin:8px}</style></head><body><section class="slide active" id="fixture"><div class="hdr">Formula styles</div><div data-b35-formula ${extra}>${content}</div></section></body></html>`;

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const check = async (name, html, rule, expected, kind, options = config) => {
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(auditFormulaStyles, options);
      const matching = findings.filter((item) => (!rule || item.rule === rule) && (!kind || item.evidence.kind === kind));
      assert.equal(matching.length > 0, expected, `${name}: ${JSON.stringify(findings)}`);
      results.push({ name, passed: true, findings });
    };
    await check("same-family formula passes", wrap("x + 1 = y"), "B35-MATH-006", false);
    await check("mixed formula families warn", wrap('<span style="font-family:Georgia">x + 1</span> = y'), "B35-MATH-006", true);
    await check("large base-size mismatch warns", wrap('<span style="font-size:12px">x + 1</span> = y'), "B35-MATH-007", true);
    await check("ordinary exponent size is allowed", wrap('x<sup style="font-size:10px">2</sup> = y<sup style="font-size:10px">2</sup>'), "B35-MATH-007", false);
    await check("fraction script levels are allowed", wrap(`${fraction} = ${fraction}`), "B35-MATH-007", false);
    await check("fraction/slash mismatch warns", wrap(`${fraction} = 1/2`), "B35-MATH-008", true);
    await check("fraction/Unicode mismatch warns", wrap(`${fraction} = ½`), "B35-MATH-008", true);
    await check("consistent fraction notation passes", wrap(`${fraction} = ${fraction}`), "B35-MATH-008", false);
    await check("date is not a slash fraction", wrap(`${fraction}; date 20/10/2026`), "B35-MATH-008", false);
    await check("rate unit is not a slash fraction", wrap(`${fraction} km/h`), "B35-MATH-008", false);
    await check("percent/decimal conversion is legitimate", wrap("50% = 0.5"), "B35-MATH-009", false);
    await check("percent spacing mismatch warns", wrap("25% + 25 % = 50%"), "B35-MATH-009", true);
    await check("percent symbol mismatch warns", wrap("25% + 25％ = 50%"), "B35-MATH-009", true);
    await check("consistent percentage spacing passes", wrap("25 % + 25 % = 50 %"), "B35-MATH-009", false);
    await check("caret exponent warns", wrap("x^2 = 4"), "B35-MATH-010", true);
    await check("mixed power renderers warn", wrap("x² = x<sup>2</sup>"), "B35-MATH-010", true);
    await check("single semantic power style passes", wrap("x<sup>2</sup> = y<sup>2</sup>"), "B35-MATH-010", false);
    await check("empty fraction part fails", wrap('<math><mfrac><mrow></mrow><mn>2</mn></mfrac></math>'), "B35-MATH-011", true);
    await check("valid fraction passes", wrap(fraction), "B35-MATH-011", false);
    await check("explicit exercise blank is exempt", wrap('<math data-b35-allow-empty-math><mfrac><mrow></mrow><mn>2</mn></mfrac></math>'), "B35-MATH-011", false);
    await check("renderer error fails", wrap('<math><merror><mtext>Invalid expression</mtext></merror></math>'), "B35-MATH-011", true);
    await check("formula clipping fails", wrap(`<div style="height:8px;overflow:hidden">${fraction}</div>`), "B35-MATH-012", true);
    await check("formula contained in panel passes", wrap(`<div style="height:100px;overflow:hidden">${fraction}</div>`), "B35-MATH-012", false);
    await check("crowded equation lines fail", wrap("x + 1 = 2<br>x = 1", 'style="line-height:10px"'), "B35-MATH-013", true);
    await check("spaced equation lines pass", wrap("x + 1 = 2<br>x = 1", 'style="line-height:40px"'), "B35-MATH-013", false);
    await check("related formula families warn", wrap('<div data-b35-formula-set><div class="work" style="font-family:Georgia">x = 1</div><div class="work">y = 2</div></div>'), "B35-MATH-006", true, "peer-formula-family");
    await check("related formula sizes warn", wrap('<div data-b35-formula-set><div class="work" style="font-size:12px">x = 1</div><div class="work">y = 2</div></div>'), "B35-MATH-007", true, "peer-formula-size");
    await check("hidden formula is ignored", wrap('<div style="display:none"><span style="font-family:Georgia">x</span> = y</div>'), "B35-MATH-006", false);
    await check("intentional notation conversion is exempt", wrap(`${fraction} = 1/2`, "data-b35-allow-mixed-notation"), "B35-MATH-008", false);
    await check("SVG tspans with mixed fonts warn", wrap('<svg width="400" height="100"><text x="10" y="50" font-family="Arial">x = <tspan font-family="Georgia">y</tspan></text></svg>'), "B35-MATH-006", true);
    await check("numerator/denominator family mismatch warns", wrap('<math><mfrac><mn style="font-family:Georgia">1</mn><mn>2</mn></mfrac></math>'), "B35-MATH-006", true, "fraction-part-family");
    await check("numerator/denominator size mismatch warns", wrap('<math><mfrac><mn style="font-size:8px">1</mn><mn>2</mn></mfrac></math>'), "B35-MATH-007", true, "fraction-part-size");
    await check("answer chip size is not formula size", wrap('<span class="answer-tag" style="font-size:8px">ANSWER 1</span> x = 2'), "B35-MATH-007", false);
    await check("mixed-number percent does not create fake spacing", wrap(`3 ${fraction}% = 3.5%`), "B35-MATH-009", false);
    await check("font change within MathML equation warns", wrap('<math><mi style="font-family:Georgia">x</mi><mo>=</mo><mn>1</mn></math>'), "B35-MATH-006", true);
    await check("size change within MathML equation warns", wrap('<math><mi style="font-size:8px">x</mi><mo>=</mo><mn>1</mn></math>'), "B35-MATH-007", true);
    await check("MathML exponent size is structural", wrap('<math><msup><mi>x</mi><mn>2</mn></msup><mo>=</mo><mn>4</mn></math>'), "B35-MATH-007", false);

    const autoWrap = (content,extra="") => wrap(content,extra).replace("data-b35-formula ","");
    const root = '<math style="font-size:inherit;font-weight:400"><msqrt><mn>25</mn></msqrt></math>';
    await check("plain footer semantic maths is discovered for family checking", autoWrap('<div class="mini"><math style="font-family:Georgia"><msqrt><mn>25</mn></msqrt></math> = 5</div>'), "B35-MATH-006", true);
    await check("plain footer semantic maths is discovered for size checking", autoWrap('<div class="mini"><math style="font-size:12px"><msqrt><mn>25</mn></msqrt></math> = 5</div>'), "B35-MATH-007", true);
    await check("normal root and bold answer warn at identical font sizes", autoWrap(`<div class="mini" style="font-size:13px;font-weight:900">${root} = 5</div>`), "B35-MATH-016", true);
    await check("consistently bold root equation passes weight check", autoWrap('<div class="mini" style="font-weight:900"><math style="font-size:inherit;font-weight:inherit"><msqrt><mn>25</mn></msqrt></math> = 5</div>'), "B35-MATH-016", false);
    await check("consistently regular equation passes weight check", autoWrap(`${root} = 5`), "B35-MATH-016", false);
    await check("mixed numerator/denominator weight is checked", autoWrap('<p><math><mfrac><mn style="font-weight:900">1</mn><mn style="font-weight:400">2</mn></mfrac></math> = 0.5</p>'), "B35-MATH-016", true);
    await check("exponent weight is structural", autoWrap('<p class="mini" style="font-weight:900">x<sup style="font-weight:400">2</sup> = 4</p>'), "B35-MATH-016", false);
    await check("small uniformly styled teaching equation warns", autoWrap('<div class="mini" style="font-size:13px">25 = 5 × 5</div>'), "B35-MATH-017", true);
    await check("readable teaching equation at threshold passes", autoWrap('<div class="mini" style="font-size:18px">25 = 5 × 5</div>'), "B35-MATH-017", false);
    await check("tiny exponents do not trigger a base-size floor", autoWrap('<div class="mini" style="font-size:18px">5<sup style="font-size:8px">2</sup> = 25</div>'), "B35-MATH-017", false);
    await check("fraction script reduction does not trigger a base-size floor", autoWrap(`<div class="mini" style="font-size:18px"><math style="font-size:inherit">${fraction.replace(/<\/?math>/g,"")}</math> = 0.5</div>`), "B35-MATH-017", false);
    await check("hidden small teaching equation is ignored", autoWrap('<div class="mini" style="display:none;font-size:8px">25 = 5 × 5</div>'), "B35-MATH-017", false);
    await check("footer labels are not equation tokens", autoWrap('<div class="mini"><span class="answer-tag" style="font-size:8px;font-weight:900">ANSWER 1</span>25 = 5 × 5</div>'), "B35-MATH-016", false);
    await check("documented equation-weight exception is honoured", autoWrap(`${root} = <b>5</b>`, 'data-b35-allow-formula-weight'), "B35-MATH-016", false);
    await check("documented small-equation exception is honoured", autoWrap('<div class="mini" data-b35-allow-small-equation style="font-size:10px">25 = 5 × 5</div>'), "B35-MATH-017", false);
    await check("unrelated heading is not promoted into a formula", autoWrap('<div class="card"><h3 style="font-size:40px;font-weight:900">A heading</h3><p class="mini"><math style="font-size:inherit">1</math> = 1</p></div>'), "B35-MATH-007", false);
    await check("plain paragraph containing semantic maths is discovered", autoWrap('<p style="font-weight:900">'+root+' = 5</p>'), "B35-MATH-016", true);
    await check("SVG equation base weight is checked", autoWrap('<svg width="400" height="100"><text x="10" y="50" font-weight="900">x = <tspan font-weight="400">1</tspan></text></svg>'), "B35-MATH-016", true);
    await check("zoom does not hide undersized design-space equations", autoWrap('<div class="mini" style="font-size:13px">25 = 5 × 5</div>').replace('class="slide active"','style="width:450px;transform:scale(2);transform-origin:top left" class="slide active"'), "B35-MATH-017", true);
    await check("small whole-slide scaling does not create a font-size failure", autoWrap('<div class="mini" style="font-size:18px">25 = 5 × 5</div>').replace('class="slide active"','style="width:450px;transform:scale(.5);transform-origin:top left" class="slide active"'), "B35-MATH-017", false);
    const customFloor=structuredClone(config);customFloor.thresholds.teachingEquationMinimumFontPx=12;
    await check("teaching equation size floor is configurable", autoWrap('<div class="mini" style="font-size:13px">25 = 5 × 5</div>'), "B35-MATH-017", false, undefined, customFloor);
    const customWeight=structuredClone(config);customWeight.thresholds.formulaMaximumFontWeightDifference=600;
    await check("weight difference threshold is configurable", autoWrap(`<div class="mini" style="font-weight:900">${root} = 5</div>`), "B35-MATH-016", false, undefined, customWeight);

    const wholeRoot='<math><msqrt><mn>25</mn></msqrt><mo>=</mo><mn>5</mn></math>';
    await check("root-only MathML with HTML answer warns", autoWrap(`<div class="mini">${root} = 5</div>`), "B35-MATH-018", true);
    await check("whole MathML root equation passes", autoWrap(`<div class="mini">${wholeRoot}</div>`), "B35-MATH-018", false);
    await check("whole equation followed by punctuation passes", autoWrap(`<p>${wholeRoot}.</p>`), "B35-MATH-018", false);
    await check("equation wholly in ordinary HTML warns", autoWrap('<p>x<sup>2</sup> + 1 = 5</p>'), "B35-MATH-018", true);
    await check("fraction-only MathML with HTML answer warns", autoWrap(`<div class="work">${fraction} = 0.5</div>`), "B35-MATH-018", true);
    await check("two MathML fragments joined by HTML relation warn", autoWrap(`<p>${root} = <math><mn>5</mn></math></p>`), "B35-MATH-018", true);
    await check("adjacent MathML fragments are not a complete equation", autoWrap(`<p>${root}<math><mo>=</mo><mn>5</mn></math></p>`), "B35-MATH-018", true);
    await check("two complete MathML equations on one line pass", autoWrap(`<p>${wholeRoot}; <math><mi>x</mi><mo>=</mo><mn>1</mn></math></p>`), "B35-MATH-018", false);
    await check("inline root in explanatory sentence is allowed", autoWrap(`<p>The square root is ${root}, so the side is positive.</p>`), "B35-MATH-018", false);
    await check("inline equation in prose is allowed", autoWrap(`<p>Use x = ${root} to find the missing length.</p>`), "B35-MATH-018", false);
    await check("prose in a formula-class container is still prose", autoWrap(`<div class="formula">We know that x = ${root} here.</div>`), "B35-MATH-018", false);
    await check("full equation with unit outside MathML warns", autoWrap(`<p>${wholeRoot} cm</p>`), "B35-MATH-018", true);
    await check("full equation with unit inside MathML passes", autoWrap('<p><math><mi>x</mi><mo>=</mo><mn>5</mn><mtext> cm</mtext></math></p>'), "B35-MATH-018", false);
    await check("hidden split equation is ignored", autoWrap(`<p style="visibility:hidden">${root} = 5</p>`), "B35-MATH-018", false);
    await check("answer tag outside equation is allowed", autoWrap(`<p><span class="answer-tag">ANSWER 1</span>${wholeRoot}</p>`), "B35-MATH-018", false);
    await check("intentional equation split can be documented", autoWrap(`<p data-b35-allow-split-equation>${root} = 5</p>`), "B35-MATH-018", false);
    await check("ordinary small footer description is not an equation", autoWrap('<div class="mini">Square area = side × side</div>'), "B35-MATH-018", false);
    await check("question prose with equality is not a standalone equation", autoWrap('<p>Find x if x + 1 = 3.</p>'), "B35-MATH-018", false);
    await check("explicit standalone label overrides conservative prose filter", autoWrap('<div data-b35-standalone-equation>Total = 5</div>'), "B35-MATH-018", true);
    await check("br-separated whole MathML rows pass", autoWrap(`<div class="work">${wholeRoot}<br>${wholeRoot}</div>`), "B35-MATH-018", false);
    await check("br-separated split and complete rows warn", autoWrap(`<div class="work">${root} = 5<br>${wholeRoot}</div>`), "B35-MATH-018", true);
    await check("nested rows do not duplicate findings", autoWrap(`<div class="work"><p>${root} = 5</p></div>`), "B35-MATH-018", true);
    const noWholeEquation=structuredClone(config);noWholeEquation.formulaConsistency.fullEquationMathML=false;
    await check("whole equation check can be disabled", autoWrap(`<p>${root} = 5</p>`), "B35-MATH-018", false, undefined, noWholeEquation);
    const allowKatex=structuredClone(config);allowKatex.formulaConsistency.standaloneEquationRenderers=['mathml','katex'];
    await check("another complete renderer can be allowed explicitly", autoWrap('<p><span class="katex">x = 1</span></p>'), "B35-MATH-018", false, undefined, allowKatex);
    await check("other renderers are not silently accepted as MathML", autoWrap('<p><span class="katex">x = 1</span></p>'), "B35-MATH-018", true);
    await page.setContent(autoWrap(`<div class="work"><p>${root} = 5</p></div>`));
    const wholeFindings=(await page.evaluate(auditFormulaStyles,config)).filter(item=>item.rule==='B35-MATH-018');
    assert.equal(wholeFindings.length,1);
    assert.equal(wholeFindings[0].evidence.rows.length,1);
    assert.match(wholeFindings[0].evidence.rows[0].rendererParts[0].markup,/<msqrt>/);
    for(const field of ['selector','expected','impact','suggestedAction','confidence'])assert.ok(wholeFindings[0][field]);
    assert.ok(wholeFindings[0].verification.length>=2);assert.ok(wholeFindings[0].constraints.length>=2);
    results.push({name:'whole-equation finding is singular and LLM-actionable',passed:true,findings:wholeFindings});

    // New findings must tell another LLM where, why and how to review the issue.
    await page.setContent(autoWrap(`<div class="mini" style="font-size:13px;font-weight:900">${root} = 5</div>`));
    const actionable = (await page.evaluate(auditFormulaStyles,config)).filter(item=>["B35-MATH-016","B35-MATH-017"].includes(item.rule));
    assert.equal(actionable.length,2);
    for (const item of actionable) {
      for (const field of ["selector","expected","impact","suggestedAction","confidence"]) assert.ok(item[field],field);
      assert.ok(item.verification.length>=2);
      assert.ok(item.evidence.measurements.length>=2);
    }
    results.push({name:"new findings contain actionable evidence and verification",passed:true,findings:actionable});

    const index = process.argv.indexOf("--out");
    if (index >= 0) {
      const output = path.resolve(process.argv[index + 1]);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify({ passed: results.length, failed: 0, results }, null, 2) + "\n");
    }
    console.log(JSON.stringify({ passed: results.length, failed: 0, tests: results.map((result) => result.name) }, null, 2));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
