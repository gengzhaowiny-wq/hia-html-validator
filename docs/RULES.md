# Detailed validation rules

## Radical construction — B35-MATH-020

Split HTML `.root` components containing `.root-mark` or `.radicand` receive a
construction warning: independently aligned glyphs and CSS borders need review.
SVG radicals marked `data-b35-diagram="radical"` must identify the sign path with
`data-b35-radical-sign` and radicand text with `data-b35-radicand`. Their rendered
boxes are checked for radicands extending above the sign, beyond the bar,
or outside the SVG. Text descenders may extend below the hook when they remain
inside the SVG. Missing markers also warn.

Configure `complementaryChecks.symbolRendering.radicalGeometryEnabled` (default
true), `thresholds.radicalGeometryTolerancePx` (default 2), and
`policy.radicalGeometrySeverity` (default warning). An intentional construction
comparison may use `data-b35-allow-radical-variation` with a documented reason.
This heuristic does not measure screenshot pixels, hook/bar connectivity or
optical stroke balance, and does not certify native MathML. Review the complete
expression after fonts settle; existing B35-MATH-019 review gates remain active.

For installation and everyday use, start with [README.md](../README.md). LLM assistants should also read [AGENTS.md](../AGENTS.md).

**Installable terminal package (v1.6.1):** see [installation and command-line guide](CLI_GUIDE.md). Run `hia-html-validator file.html`; auto mode selects the existing B35 lesson checks or a bounded general-HTML profile. Reports remain diagnostic, not automatic visual approval. The direct commands below retain the original lesson-only entry point.

This package converts the automated parts of **B35. Manual lesson-compaction acceptance record** into repeatable checks for self-contained HTML lesson decks.

It deliberately does **not** claim that automation completes B35. Source fidelity, mathematical correctness, teaching purpose, page economy and final visual judgment remain manual yes/no gates. A deck can receive an automated pass while its overall B35 status remains `MANUAL REVIEW REQUIRED`.

## Run

```bash
npm install
npx playwright install chromium
npm run validate -- /absolute/path/to/lesson.html \
  --config ./config/b35.rules.json \
  --out ./results/lesson-name
```

For a source-only preflight, which does not render the deck:

```bash
npm run validate -- /absolute/path/to/lesson.html \
  --config ./config/b35.rules.json \
  --out ./results/lesson-name-static \
  --static-only
```

The browser run creates:

- `report.json` — machine-readable findings and evidence.
- `report.md` — concise audit report and B35 manual checklist.
- `visual-review.html` — initial/middle/final reveal gallery with manual checkboxes.
- `screenshots/` — rendered evidence used by the gallery.

The process exits with:

- `0` — automated checks passed; manual B35 review is still required.
- `1` — one or more automated errors were found.
- `2` — the browser stage could not run or the command was invalid.

## Rules derived from B35

| Rule | What it checks | Gate |
|---|---|---|
| `B35-SOURCE-001` | Required lesson shell and unique IDs | Automated |
| `B35-SOURCE-002` | Every inline script parses | Automated |
| `B35-REVEAL-001` | Reveal steps are positive, contiguous and DOM-ordered | Automated |
| `B35-PAGE-001` | Source-only standalone answer-page compaction candidate | Review warning |
| `B35-PAGE-002` | Adjacent question-only page duplicates the worked page's initial state without detected unique first-page material | Cross-page review warning |
| `B35-RUNTIME-001` | Exactly one active slide; navigator counter and step counter are correct | Automated |
| `B35-CANVAS-001` | Slide/panel overflow, clipping and internal scrolling | Automated |
| `B35-CANVAS-002` | Visible panels remain inside all four slide edges | Automated |
| `B35-CANVAS-003` | Navigator does not cover visible teaching content | Automated |
| `B35-CANVAS-004` | Unexpected sibling-panel collisions | Automated |
| `B35-CANVAS-005` | Mostly-empty large cards and isolated short lines | Heuristic warning |
| `B35-ORDER-001` | No answer element is visible at the initial reveal | Automated |
| `B35-TASK-001` | Student-attempt cards are dark, visually distinct and have a number chip | Automated |
| `B35-TASK-002` | Question and answer treatment remains distinguishable | Automated |
| `B35-MATH-001` | No legacy `.frac` remains after runtime transformation | Automated |
| `B35-MATH-002` | Formula/fraction/root boxes have non-zero readable geometry | Automated |
| `B35-MATH-003` | Math and diagram typography meets configured size thresholds | Heuristic warning |
| `B35-MATH-004` | Math ink extends beyond a visible-overflow line box; inspect collision/clipping in context | Heuristic warning |
| `B35-MATH-005` | SVG formula tokens overlap, or a fraction bar is displaced from a neighbouring equals-sign axis | Collision error; axis warning |
| `B35-MATH-006` | Different computed font families within a formula, between its numerator/denominator, or across related formula rows | Review warning |
| `B35-MATH-007` | Base formula font sizes differ beyond a configured ratio | Review warning |
| `B35-MATH-008` | Slash, Unicode, CSS and MathML fraction styles are mixed within one formula | Review warning |
| `B35-MATH-009` | Percentage glyphs or number-to-percent spacing vary in one formula | Review warning |
| `B35-MATH-010` | Raw caret powers or mixed Unicode/semantic power notation | Review warning |
| `B35-MATH-011` | Empty/malformed fractions or visible math-renderer error output | Automated error |
| `B35-MATH-012` | Formula ink extends beyond an ancestor that clips or scrolls its content | Automated error |
| `B35-MATH-013` | Ink from adjacent br-separated equation lines collides or has insufficient clearance | Error for collisions; warning for tight spacing |
| `B35-MATH-014` | Fraction numeric glyph boxes are too small, disproportionate to surrounding digits, or inconsistent with peer fractions | Review warning |
| `B35-MATH-015` | A formula soft-wraps across rendered lines without explicit equation-row boundaries | Review warning |
| `B35-MATH-016` | Comparable equation base tokens mix regular and bold weights, including MathML radicals/fractions and SVG text | Review warning |
| `B35-MATH-017` | A standalone teaching equation is consistently too small, even if its left/right font sizes match | Configurable readability warning |
| `B35-MATH-018` | A standalone equation is split across HTML/renderer fragments, or is not wholly in the configured complete renderer (MathML by default) | Authoring-contract review warning |
| `B35-MATH-019` | Radical/fraction-bar strokes lack current visual-review evidence, or an inspectable SVG stroke violates its declared range | Review-required warning; not pixel certification |
| `B35-LAYOUT-001` | Matching comparison cards have inconsistent role positions, formula heights or formula typography | Review warning |
| `B35-LAYOUT-002` | Corresponding card footers, including plain text, differ in base font, size, weight, line-height or padding | Measured-style warning |
| `B35-LAYOUT-003` | Footer heights/insets differ, or content is not centred under an explicit alignment contract | Geometry/estimated-content warning |
| `B35-DIAGRAM-001` | Declared fraction-bar geometry/labels contradict the model; also reviews narrowly inferred labelled bars | Declared model error; inferred review warning |
| `B35-DIAGRAM-002` | Nested rectangles contradict declared percentages, or inferred labels suggest an ambiguous area representation | Declared model error; inferred review warning |
| `B35-DIAGRAM-003` | A diagram label is detached from its target without a verified connector, or a reference is missing | Review warning |
| `B35-CONTENT-001` | A configured answer concept is absent from selected visible premises/context | Bounded-vocabulary review warning |
| `B35-COMPOSITION-001` | Large panels have low content occupancy or columns leave substantial unused height | Final-state review warning |
| `B35-COMPOSITION-002` | Related panels have very different densities, or adjacent teaching blocks have insufficient clearance | Final-state review warning |
| `B35-SVG-001` | SVG has a `viewBox` and non-zero geometry; accessible-name check is optional and off by default | Automated |
| `B35-CONTRAST-001` | Sampled visible text meets configured contrast ratios | Heuristic warning |
| `B35-RUNTIME-002` | No page exception, console error or failed essential local resource | Automated |

## SVG formula collision and alignment rule

### Equation discovery, weight and classroom readability

`B35-MATH-006/007` already compare font families and relative base font sizes. They do not establish that a consistently small equation is readable, or that regular-weight MathML looks balanced against a bold answer. Formula discovery now also includes `.mini` teaching callouts and the nearest ordinary paragraph/callout around semantic maths. It does not promote unrelated card headings into equation text.

`B35-MATH-016` warns when comparable base glyphs mix regular weight (≤500) and bold weight (≥600), with a difference of at least `formulaMaximumFontWeightDifference` (default 200). It examines fraction digits but excludes intentional exponent/subscript/root-index tokens. Renderer wrappers can reset weight to 400 even when both sides report the same font family and size. This is a review candidate, not a prohibition on deliberate emphasis; use `data-b35-allow-formula-weight` only after documenting an intentional exception.

`B35-MATH-017` checks concise standalone equations selected by `formulaConsistency.teachingEquationSelectors` (default `.formula,.mini,[data-b35-equation],[data-b35-formula-role='teaching']`). They must contain a relation/equality and numeric or semantic maths. `teachingEquationMinimumFontPx` defaults to **18px in unscaled slide-design coordinates**, so browser zoom cannot hide the problem. Fractions and superscripts retain their intentional structural size reductions. This is a lesson-design threshold, not an accessibility standard or a universal minimum for inline prose. Configure the selectors, `teachingEquationMaximumCharacters`, threshold, or a documented `data-b35-allow-small-equation` exception for a different design.

Both new warnings include the slide, precise selector, measured tokens, expected appearance, impact, proposed review/action and verification steps. They never edit the lesson. Limits remain: computed styles are not pixel-level font recognition; screenshot review still matters.

Example actionable warning: **B35-MATH-016, page 3** — “Equation mixes regular-weight maths (400) with bold base text (900); align the visual weight across the equation.” Its evidence identifies the radicand and `= 5`; the action asks the repairer to inherit the equation weight into the maths wrapper, preserve the equation and recheck clipping/spacing.

### Complete standalone equations — B35-MATH-018

Standalone equations should be generated as complete MathML expressions, not token-only conversions such as a MathML root followed by an HTML equals sign and answer. The check also warns for an equation written wholly in ordinary HTML. It is an authoring convention, **not an assertion that mixed HTML/MathML is invalid HTML**.

The rule examines settled visible equation rows. It handles HTML wrappers, explicit BR/block rows, powers, fraction/root islands, and multiple complete equations. Labels are excluded and trailing sentence punctuation is allowed outside the maths. A complete equation's units, operators and both sides of the relation belong inside its renderer.

Ordinary explanatory sentences with inline maths are allowed. Automatic classification is deliberately conservative: it looks for a concise relation/equality row with no detected explanatory prose outside the maths. It is **not a natural-language or mathematical proof engine**. Ambiguous labels can be reviewed and marked with `data-b35-standalone-equation` or `data-b35-equation` to declare the contract explicitly. The existing `.mini`, `.formula`, `.work`, known worked/answer rows and paragraphs are scanned by default; custom containers can be supplied through `standaloneEquationSelectors`.

Configuration lives under `formulaConsistency`:

- `fullEquationMathML`: enabled by default; set false to disable.
- `standaloneEquationRenderers`: defaults to `["mathml"]`. A coherent complete `katex` or `mathjax` renderer can be explicitly accepted, without accepting split pieces of it.
- `standaloneEquationMaximumCharacters`: default 160 for inferred rows; explicit standalone declarations bypass this inference limit.
- `standaloneEquationWords`: optional list of permitted mathematical functions, units and named quantities for inference; overrides the built-in list.
- `standaloneEquationSelectors`: customise which display containers are scanned.
- `policy.fullEquationMathMLSeverity`: warning by default; can be configured independently.

Use `data-b35-allow-split-equation` only for a documented intentional exception. The validator never converts or repairs equations automatically. Each finding provides row evidence, renderer fragments/markup, text outside maths, selectors, expected structure, an LLM-actionable repair instruction, and verification safeguards.

**A complete MathML expression does not prove that radical signs and bars have balanced visual strokes.** The complementary footer and symbol checks below address the separately proposed checks; they do not turn MathML structure or matching CSS weights into visual approval.

### Complementary footer and symbol checks — version 1.5.0

All three run through `auditComplementaryChecks` in `complementary-rules.cjs`, on every settled reveal state, without editing the lesson. Findings include selectors, measurements, expected appearance, impact, repair/review instructions, confidence, verification steps and safeguards.

1. **B35-LAYOUT-002 — shared footer typography.** Compare corresponding footer roles across cards, whether they contain plain text or maths. Compare the base family, size, weight, line-height declaration and padding, and the configured minimum size. This catches a maths-only override that leaves other footers smaller. Intentional mathematical script-size reductions remain covered by the existing formula rules rather than flattened to one size.
2. **B35-LAYOUT-003 — footer geometry and content alignment.** Compare footer heights and bottom/side insets within their cards. Independently check horizontal/vertical content centres when the model explicitly requires centring. Matching bottom edges or matching `text-align` values are not sufficient. Content bounds combine text ranges/canvas ink estimates and MathML structural boxes, excluding outer maths padding. These are geometric estimates, not pixel-level optical approval.
3. **B35-MATH-019 — mathematical-symbol stroke review.** Native radicals, fraction bars, CSS roots/fractions, SVG radical text and explicitly declared SVG symbols require rendered review. Equal CSS weight, even 900, does **not** verify the drawn strokes. Findings retain `visualWeightVerified: false` and `status: "review-required"`. Inspectable SVG stroke widths/filled bar thicknesses can additionally be tested against an explicit range; that measurement alone still does not certify visual balance with the rest of the equation. Mathematical bars need not have exactly the same thickness as digits.

The default configuration defines a template-specific contract for `.three,.four,[data-b35-footer-group]`, direct child cards, and their `.mini` or `[data-b35-card-footer]` footers. It requires shared styling, an 18px base size, and centred content. **This is not a universal rule that all HTML footers must be centred.** Customise `complementaryChecks.footerGroups`, including `selector`, `cardSelector`, `footerSelector`, `minimumFontSizePx`, `requireAll` and `alignment`. Omit `alignment` to compare boxes without requiring centred content. A grid with no footer roles is skipped unless explicitly marked as a footer group or configured with `expectFooters: true`. Missing required visible footers are reported at the final reveal, not while content is intentionally hidden.

Tolerances are `footerFontTolerancePx` (0.5), `footerWeightTolerance` (100), `footerBoxTolerancePx` (1), and `footerContentCenterTolerancePx` (2), in unscaled slide-design coordinates where applicable. Independent policy switches are `footerTypographySeverity`, `footerAlignmentSeverity`, and `symbolRenderingSeverity`; each accepts `"off"`. Set `complementaryChecks.footersEnabled` or `complementaryChecks.symbolRendering.enabled` to false to disable that family. A documented group-level `data-b35-allow-footer-variation` or `data-b35-allow-card-variation` exempts an intentional footer variation.

Symbol configuration lives under `complementaryChecks.symbolRendering`: customise `selectors`, `formulaScopes` and optional `strokeContracts` entries such as `{ "selector": "#example-bar", "minimumPx": 1, "maximumPx": 2 }`. Explicit SVG shapes use `data-b35-math-symbol="radical"` or `"fraction-bar"`.

To resolve a pending symbol review, a reviewer must inspect the actual equation at lesson size and close-up, then supply a configuration `approvals` record with the exact finding's `selector` and `fingerprint`, `decision: "accepted"`, a named `reviewer`, ISO `reviewedAt`, and an `evidenceRef` pointing to retained review evidence. No approvals are generated automatically, and an HTML `reviewed` attribute does not clear a finding. Changed equation markup/styles invalidate the matching fingerprint; an unmet explicit stroke contract cannot be waived by an approval.

An approval is a **trusted reviewer assertion**, not independent machine verification of its screenshot or evidence file. The fingerprint detects changes in the sampled DOM, styles, geometry and font-load state; it is not a cryptographic content signature or a hash of font binaries/browser builds. Re-review after font or browser changes, and retain the viewport/render details with the evidence. Without genuine review, leave the warning open. These checks are not accessibility checks.

Run the new controlled regressions with `npm run test:complementary`. Include the real Chapter 8 page-3 regression with:

```bash
npm run test:complementary -- --chapter8 /absolute/path/to/Y8_Ch08_Pythagoras_validated.html
```

Development Chapter 8 reports are not included in this distributable. The installer bundle's VERIFICATION.md records release-test coverage; run the tool on your own input to obtain fresh evidence.

### SVG collision details

`B35-MATH-005` measures visible text and MathML/HTML formula tokens inside SVG conversion groups after fonts and reveal animations settle. It treats a fraction as one token, so its numerator, bar, denominator and superscripts are not tested as mutually colliding elements. It includes MathML descendant extents when measuring the token.

Collisions exceeding both 2 CSS pixels and 10% of the smaller token area are errors by default. Fraction bars more than 6 CSS pixels from the neighbouring equals-sign axis produce review warnings. Configure these limits with `svgFormulaOverlapTolerancePx`, `svgFormulaMinimumOverlapRatio`, and `svgFormulaAxisTolerancePx`; severities are also configurable.

Axis alignment is checked in a shared SVG `<g>` or an explicitly marked `data-b35-formula-row`. Without a neighbouring equals sign, no axis assertion is made. This rule covers formulas converted into SVG `foreignObject` elements; it does not certify arbitrary diagrams, pure SVG fraction paths, or ordinary HTML equation layout. Baseline inference is approximate and requires visual review.

An intentional overlap may be exempted with `data-b35-allow-math-overlap` on its group. Intentional axis offsets may be exempted with `data-b35-allow-math-offset`. Keep any exemption documented in the manual acceptance record.

Run the browser regression cases with `npm test`. To include the known Chapter 7 page-3 failure:

```bash
npm test -- --lesson /absolute/path/to/Y8_Ch07_Percentages.html
```

## Adding a rule

Source rules are registered in `staticRuleRegistry`. Browser checks run in `runtimeAuditFunction`, `auditSvgFormulas` (in `svg-formula-rules.cjs`), `auditFormulaStyles` (in `formula-style-rules.cjs`), `auditVisualModels` (in `visual-model-rules.cjs`), `auditVisualReview` (in `visual-review-rules.cjs`) and `auditComplementaryChecks` (in `complementary-rules.cjs`). Each is called for every reveal state. Each finding uses the same shape:

```js
{
  rule: "B35-CANVAS-006",
  severity: "error",
  slide: "s12",
  state: "2/4",
  selector: ".worked-example",
  message: "Worked example extends 14px beyond the bottom edge.",
  evidence: { overflowBottomPx: 14 }
}
```

Configuration belongs in `config/b35.rules.json`. New thresholds and selectors can therefore be changed without editing the browser traversal logic.

## Formula typography and notation consistency

The style checks compare the entire formula, so differences between its left and right sides are included. Candidate contexts include `.formula`, `.work`, explicit `[data-b35-formula]` elements, SVG formula conversion groups, math-like SVG text (including styled tspans), and mathematical prompt/solution/answer blocks. Related rows are compared inside `.steps-col`, `.practice-answers`, or `[data-b35-formula-set]`.

The default maximum base font-size ratio is **1.2** (a 20% difference). Structural superscripts, subscripts and MathML fraction script levels are allowed to differ from base text. Numerator and denominator are compared to each other instead. Different font weights or italic variables are not treated as font-family failures.

Answer tags, question-number chips and other component labels are excluded from formula typography; their deliberately smaller type is not an equation-size mismatch. `formulaConsistency.labelSelectors` controls that exclusion. Font changes inside MathML expressions and SVG tspans are included, not just changes between whole formula containers.

Examples:

- `1/2 =` followed by a stacked MathML fraction is a fraction-style candidate.
- `25% + 25 % = 50%` has inconsistent percentage spacing.
- `25% + 25％ = 50%` mixes ASCII and full-width percent signs.
- `50% = 0.5` is a valid representation conversion and does not fail percentage consistency.
- A mixed number such as `3 [stacked one-half]%` is not treated as a spaced `3 %`; the fraction is retained as a semantic boundary when checking percent spacing.
- `x² = x<sup>2</sup>` mixes power representations; `x^2` is flagged as raw caret notation.
- Fractions with blank numerators or denominators are errors unless intentionally marked as exercise blanks.

These style findings are **warnings by default**. An intentional teaching comparison may use different representations; record that choice and exempt its container with `data-b35-allow-mixed-notation`. Intentional typography differences can use `data-b35-allow-formula-style`. Intended blanks can use `data-b35-allow-empty-math`.

Tune `formulaMaximumFontSizeRatio`, `formulaMinimumLineGapPx`, `formulaClippingTolerancePx`, the `formulaConsistency` selectors and aliases, and the formula-related severity entries in `config/b35.rules.json`. Font-family alias keys are lowercase, for example `{"times new roman":"serif","georgia":"serif"}` if those families are intentionally interchangeable in your design.

Font comparisons use computed CSS font families and rendered sizes, not a guarantee about the actual fallback font selected for each glyph. The notation checks identify common presentation patterns; they do not prove mathematical equality or enforce identical representations where a conversion is the teaching goal. The equation-line check currently covers explicit `<br>` breaks in recognised formula blocks; arbitrary wrapping or independent SVG labels still require visual review.

Run **all browser regression checks** with `npm test`, or only the new style checks with `npm run test:styles`. `npm test -- --lesson /absolute/path/to/Y8_Ch07_Percentages.html` also includes the original page-3 collision regression.

## Important interpretation

- Source-only success is candidate discovery, not visual acceptance.
- Runtime checks inspect the post-script DOM, so decks that merge pages or convert fractions on load are tested in their delivered state.
- The browser waits for reveal transitions before measuring or capturing a state. Source task-colour warnings are cleared when computed browser styles verify all the corresponding cards.
- Math ink outside a line box is a review warning when overflow is visible; it is not automatically labelled clipping. A clipped or scrolling container still fails the bounds check.
- SVG text contrast requires visual review: CSS ancestor backgrounds do not account for coloured rectangles and paths painted behind labels. Gradient-background text also remains a visual-review item.
- Initial, middle and final images are evidence shortcuts. B35 still requires a reviewer to inspect every meaningful reveal state; the geometry checks do visit every state even when only three are captured.
- A screenshot baseline is intentionally not included. These lesson packs change materially during compaction, so B35 calls for reviewed evidence rather than blindly accepting a pixel diff.

## Optical size, diagram models and composition

### Optical readability — B35-MATH-014

This measures numeric MathML fraction glyph boxes after browser layout. Defaults warn when a fraction digit is below **7 CSS pixels** high, its median digit height is below **60%** of the estimated surrounding digit ink height, or peer fraction digit heights differ by a factor above **1.4**. This complements the CSS base-font-size rule: two tokens with equal CSS font size can render very differently.

The check allows normal structural fraction reduction; it does not require numerator digits to be the same height as whole numbers. It ignores hidden content and structural exponent/subscript digits. Measurements are browser geometry plus canvas font-metric estimates, not a pixel segmentation of the screenshot or a guarantee about classroom readability. Current coverage is numeric MathML fractions; arbitrary path-drawn or image formulas need visual review.

Configure the `opticalFraction...` thresholds or use `data-b35-allow-optical-size` for a documented intentional exception.

### Fraction-bar models — B35-DIAGRAM-001

For strict checking, supply a reviewer-approved model either in the SVG or in the configuration. For example:

```html
<svg id="fraction-example" viewBox="0 0 350 80"
     data-b35-diagram="fraction-bar"
     data-b35-numerator="2" data-b35-denominator="7">
  <rect data-b35-whole x="0" y="0" width="350" height="70"
        fill="cyan" stroke="black" />
  <rect data-b35-shaded x="0" y="0" width="100" height="70"
        fill="purple" />
  <path d="M50 0V70 M100 0V70 M150 0V70 M200 0V70 M250 0V70 M300 0V70"
        fill="none" stroke="black" />
  <text data-b35-fraction-label x="50" y="40">2/7</text>
</svg>
```

A configuration entry offers the same model without editing the lesson:

```json
{
  "diagramModels": [
    {
      "selector": "#fraction-example",
      "type": "fraction-bar",
      "numerator": 2,
      "denominator": 7,
      "wholeSelector": "[data-b35-whole]",
      "shadedSelector": "[data-b35-shaded]",
      "partSelector": "[data-b35-part]",
      "labelSelector": "[data-b35-fraction-label]",
      "orientation": "horizontal",
      "requireEqualParts": true
    }
  ]
}
```

Add that entry to the existing configuration; the snippet alone is not a complete validator configuration. Partition boundaries can come from full-height SVG lines, simple absolute `M...V...`/`M...H...` path dividers, marked part rectangles, and shaded rectangle edges. Transforms and overlapping shaded rectangles are handled in screen coordinates; shade coverage is the union of their intervals. Vertical models use `orientation: "vertical"` or `data-b35-orientation="vertical"`. Set `requireEqualParts: false` / `data-b35-require-parts="false"` if an unpartitioned proportional bar is intended.

Strict checks cover the shaded proportion, partition count/equal sizes and an explicitly marked aggregate fraction label. A label for each individual unit should not be marked as the aggregate label. The reference model must be supplied by a reviewer; geometry matching it does not establish that the reference mathematics is correct.

Without declarations, the validator only infers a model for a simple horizontal rectangular bar with a different-colour full-height shaded rectangle and a fraction label inside the shading. Proportion/partition disagreements produce **warnings**, never inferred-model errors. Arbitrary diagrams, pies, complex SVG paths or ambiguous semantic intent remain outside this rule's coverage. `data-b35-ignore-diagram-model` exempts an intentional exception.

### Composition — B35-COMPOSITION-001

At the final reveal, large panels occupying at least **15%** of the slide are reviewed if text/graphic content boxes occupy less than **30%** of the panel. The area is a union of text and meaningful graphic boxes: empty card/SVG frames and watermarks do not inflate the teaching-content estimate. Columns leaving more than **40%** of their height unused below the last content box are also reviewed.

This is a heuristic, not a judgment of teaching quality. Bounding boxes can overestimate the ink of complex SVG paths. Intermediate reveal states are skipped so purposeful hidden answer space is not penalised. Use `data-b35-allow-empty-space` for a writing area or deliberate pause layout, and `data-b35-ignore-composition` for decorations. Selectors and thresholds are configurable.

Run `npm run test:models -- --lesson /absolute/path/to/Y8_Ch07_Percentages.html` for these regressions and the actual page-14 case. `npm test -- --lesson /absolute/path/to/Y8_Ch07_Percentages.html` runs all suites.

The accessible SVG-name check is disabled through `svgAccessibleNameSeverity: "off"`, reflecting the current scope. Contrast checks remain available as visual-legibility checks.

## Additional automated visual-review rules

Version 1.1 adds the six checks documented in [VISUAL_REVIEW_RULES.md](VISUAL_REVIEW_RULES.md), including configuration, annotations, exceptions and coverage limits. They run automatically in the normal `validate` command; no separate review command or account is needed.

They inspect rendered geometry and a configurable concept vocabulary, **not screenshot pixels**. The report now explicitly records `visualReviewCoverage`, and the gallery states that no AI image analysis is performed. A clean automated report still requires separate visual approval.

Run the new regression suite, including both the original problem pages and their repaired counterparts:

```bash
npm run test:visual-review -- \
  --lesson /absolute/path/to/Y8_Ch07_Percentages.html \
  --repaired /absolute/path/to/Y8_Ch07_Percentages_pages14_23_32_fixed.html
```

Use `npm test -- --lesson ... --repaired ...` to run all five suites. `--out /absolute/path/to/evidence.json` saves SVG-suite evidence and separate `-models` / `-visual-review` / `-page-pairs` evidence files; the style suite reports its results in the console.

## Adjacent question and worked-page duplication

Version 1.2 adds `B35-PAGE-002`, enabled automatically during browser validation. It compares **settled initial states of adjacent runtime pages**, not adjacent source IDs (which can differ after runtime compaction).

A warning requires all four conditions:

1. All recognised question texts match after NFC and whitespace normalisation. Numbers, case-sensitive variables, units, mathematical signs, MathML descriptions and superscripts are preserved. No fuzzy/paraphrase matching is used.
2. The first page has questions, but no recognised answer elements or reveal sequence.
3. The next page repeats those questions and has a reveal sequence plus recognised worked-answer elements; every reveal and answer is hidden initially.
4. The first page has no unmatched diagram, instruction, other task or residual teaching text. Opaque media/background-image content conservatively prevents a warning because equivalence cannot be verified.

The configured `pagePairs.boilerplateTexts` explicitly excludes two known generic prompts in this lesson template. Their text is recorded in each finding's evidence. Other unique instructions are **not** silently treated as boilerplate. Decorations such as headers, book tags and watermarks are excluded through `decorationSelectors`; do not classify substantive teaching material as a decoration.

The rule captures SVG/image DOM references, not pixel equivalence. A unique diagram prevents the warning. Identical DOM/reference fingerprints can support a candidate, but their actual teaching purpose and appearance still need review. CSS pseudo-element material and unrecognised custom question/answer components are limitations; configure selectors or retain manual review for such components.

Configure question/answer/instruction selectors, explicit boilerplate and exempt slide IDs under `pagePairs` in `config/b35.rules.json`. Set `pagePairs.enabled` to `false` to disable the rule. For an intentional standalone pause/workspace, mark either page with `data-b35-keep-question-page` or `data-b35-allow-repeated-question`, or add its source slide ID to `pagePairs.exemptSlideIds`.

The warning is self-contained for a human or LLM: it names both displayed pages/source IDs, quotes the questions in `evidence`, identifies selectors and initial reveal states, explains why the pair may be redundant, and supplies `expected`, `impact`, `confidence`, `suggestedAction`, `verification`, and `constraints`. These fields are included in JSON and expanded in Markdown. They explicitly prohibit automatic deletion or merging and preserve mathematical content and delayed reveal order.

Initial-state snapshots are saved as `pagePairStates` in the JSON report so another reviewer can inspect the basis of the comparison. A static-only or blocked browser run does **not** validate this rule. The validator never edits the lesson.

Run its focused regressions with:

```bash
npm run test:page-pairs -- --lesson /absolute/path/to/Y8_Ch07_Percentages.html
```
