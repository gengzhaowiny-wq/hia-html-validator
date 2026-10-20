# Automated visual-review rules

These rules run during every browser reveal-state audit. They convert measurable visual-review observations into repeatable checks. They do not run an image model, establish mathematical truth from arbitrary diagrams, or replace manual B35 acceptance. No external image service, API key or image upload is used.

## What is automatic

| Rule | Checks | Default |
| --- | --- | --- |
| B35-MATH-015 | Unexpected soft wrapping in recognised formula blocks | Warning |
| B35-LAYOUT-001 | Positions of corresponding card roles, formula heights, font families and base sizes | Warning |
| B35-DIAGRAM-002 | Declared nested-rectangle percentages; narrowly inferred area ambiguities | Error for a declared contradiction; warning for inference |
| B35-DIAGRAM-003 | Label-to-target distance and verified connecting lines | Warning |
| B35-CONTENT-001 | Selected answer concepts absent from selected visible premises | Warning |
| B35-COMPOSITION-002 | Related-panel density imbalance and tight inter-block clearance | Final-reveal warning |

Every finding has its rule, slide number, element selector and measured evidence. Ambiguous findings remain review candidates. Existing low-occupancy and unused-column checks continue under B35-COMPOSITION-001.

## 1. Equation wrapping

Text ranges are grouped into rendered lines inside `.formula`, `.work` and `[data-b35-formula]`. A segment that wraps to more than `equationMaximumSoftLines` (default **1**) is flagged. Explicit `<br>` breaks and block-level rows are treated as intentional boundaries. A segment can still warn if it wraps inside one of those explicit rows.

Semantic formulas/fractions are atomic so a numerator and denominator are not mistaken for equation lines. Ordinary prose without equation operators is excluded. Awkward operator grouping is highlighted for review, not declared mathematically wrong.

Use `data-b35-allow-equation-wrap` for a documented intentional layout. Arbitrary line breaking inside a MathML/KaTeX/MathJax formula is not analysed by this rule; existing bounds checks and screenshot review still apply.

## 2. Matching comparison cards

By default, the check recognises a horizontal `.three` or `.four` group whose visible cards each contain a formula. It compares heading, formula and example roles. Vertically stacked practice cards are excluded. A position spread above **8 CSS pixels**, a formula-bottom spread above **16 pixels**, or differing formula families/base-size ratios can warn. Coordinates are normalised for slide scaling.

For a custom component, merge an entry into `visualReview.comparisonGroups`:

```json
{
  "selector": "#comparison",
  "cardSelector": ":scope > .card",
  "roles": {
    "heading": "h3",
    "formula": ".formula",
    "example": ".note"
  },
  "requiredRoles": ["heading", "formula", "example"]
}
```

Only declared required roles are checked for absence, and only at the final reveal. You can also mark a group with `data-b35-comparison`. Use `data-b35-allow-card-variation` where different card treatments are intentional.

## 3. Nested-percentage diagrams

Supply the intended relationship explicitly for strict validation. For example, these equal-height rectangles show boys as 50% of the whole and blue-eyed boys as 25% of the boys:

```html
<svg viewBox="0 0 390 200">
  <rect id="whole" x="20" y="30" width="320" height="100" fill="cyan" />
  <rect id="boys" x="20" y="30" width="160" height="100" fill="purple"
        data-b35-percent-of="#whole" data-b35-percent="50" />
  <rect id="blue" x="20" y="30" width="40" height="100" fill="gold"
        data-b35-percent-of="#boys" data-b35-percent="25" />
  <path id="blue-leader" d="M40 130 V166" fill="none" stroke="black" />
  <text x="20" y="185" font-size="16"
        data-b35-label-for="#blue" data-b35-connector="#blue-leader">
    Blue eyes: 25% of boys
  </text>
</svg>
```

The default metric is **nominal rectangular area**, measured from browser bounding boxes, not coloured screenshot pixels. Use `data-b35-measure="width"` or `"height"` if the intended encoding is one-dimensional. This distinction matters: a box can have half another box's width but much less than half its area. Ratios allow the configured `diagramFractionRatioTolerance` (default **0.02**). Containment uses `diagramGeometryTolerancePx`.

Alternatively, add a sidecar entry to `visualReview.nestedPercentages` without editing the lesson:

```json
{
  "selector": "#groups-diagram",
  "parentSelector": "#boys",
  "childSelector": "#blue",
  "percentage": 25,
  "metric": "area"
}
```

The selector identifies a scope containing both rectangles. References in SVG annotations are resolved within that SVG. Percentages are numeric values from 0 to 100, not strings with a percent sign. Invalid or missing declared model inputs are reported, not accepted as zero.

The inference path only recognises simple nested rectangles with labels such as “50% are boys”. A second “25% of boys” label can be associated with an unlabelled child only when the parent wording matches and there is exactly one candidate. A width-correct/area-inconsistent drawing is a **review warning**, because its intended encoding is not known. Set `visualReview.inferNestedPercentages` to `false`, supply an explicit width model, or use `data-b35-ignore-nested-diagram` for a reviewed exception.

Rectangles with translation/axis-aligned scaling are supported. Rotated rectangles and non-rectangular declared regions are marked as unsupported for proportional certification. Rounded corners, strokes and clipping are not subtracted from nominal bounding-box area. Pies, overlapping complex shapes, arbitrary SVG paths, raster illustrations and the truth of the reference model still require review. Hidden regions are skipped until visible.

## 4. Diagram-label connections

Use `data-b35-label-for="#region"` on an SVG text label. A label inside or within **12 CSS pixels** of its target passes the distance check. Otherwise a painted SVG line/polyline/path must connect the two boxes. The rule checks transformed connector endpoints, allowing **6 pixels** of endpoint tolerance. Merely having a line somewhere nearby does not satisfy the check.

`data-b35-connector="#leader"` requires that particular connector to verify, even if the label is near the target. Missing targets and invalid connector selectors warn. Invisible/unpainted connectors do not count. Complex multi-segment networks with intermediate junctions are not followed.

Sidecar equivalent in `visualReview.diagramLabels`:

```json
{
  "selector": "#blue-label",
  "targetSelector": "#blue",
  "connectorSelector": "#blue-leader",
  "maximumDistancePx": 12
}
```

Without declarations, association is only attempted for the unique inferred subgroup described above. Arbitrary labels are not guessed. Use `data-b35-allow-detached-label` for a deliberate legend/caption.

## 5. Premise–answer concepts

This is a **bounded vocabulary check**, not general language understanding or proof of entailment. The default vocabulary contains the known “blue eyes” / “blue-eyed” subgroup example. Extend `visualReview.premiseConcepts` with the concepts and aliases relevant to your lessons:

```json
{
  "id": "red-counters",
  "name": "red-counter subgroup",
  "terms": ["red counters", "red counter"]
}
```

By default, visible `.step-solution.final`, `.practice-answer` and `[data-b35-answer]` elements are compared with visible `.prompt`, `.visual-card`, `.challenge-box` and `[data-b35-premise]` content on the same slide. Answer text is excluded from premises, including when nested inside a premise container. Hidden answers do not warn before reveal.

Use `visualReview.premiseAnswerChecks` to scope related questions separately or include explicit context:

```json
{
  "selector": "#question-one",
  "premiseSelectors": ".prompt,.visual-card",
  "answerSelectors": ".solution",
  "contextSelectors": ".given-context",
  "concepts": [
    {"id": "blue-eyes", "terms": ["blue eyes", "blue-eyed"]}
  ]
}
```

Context selectors are resolved on the current slide. For facts encoded graphically, put `data-b35-premise-concepts="blue-eyes"` on a visible premise element. An answer can declare `data-b35-requires-concepts="blue-eyes"`. Unknown required concept IDs without premise markers warn. Use `data-b35-allow-new-concepts` for a documented teaching transition.

A missing alias, a premise on a previous slide, or imprecise scoping can produce a review warning. Independent question blocks should have separate contracts. The rule cannot infer arbitrary missing conditions, validate factual correctness, or establish that the answer follows from the premise.

## 6. Composition and crowding

At the final reveal, recognised comparison groups and explicit `[data-b35-balance]` groups are checked for content-box density imbalance. Both a density difference above **0.20** and a maximum/minimum ratio above **1.8** are required. Normal empty writing space is not automatically judged wrong; use `data-b35-allow-visual-balance` when reviewed.

Adjacent direct child blocks inside `.card`, `.visual-card`, `.step-solution` and `[data-b35-spacing-group]` warn when their vertically ordered, horizontally overlapping boxes have less than **2 pixels** of clearance. Nested/contained boxes and absolute-positioned decorations are excluded. Use `data-b35-allow-crowding` for intentional spacing; `data-b35-ignore-composition` excludes decorations. Intermediate reveal states do not trigger composition warnings.

Density uses unions of text and graphic bounding boxes, not pixel ink. Complex drawings can inflate estimates. Corresponding card roles are compared only in recognised/declared comparison components, not across unrelated slide regions.

## Configuration and evidence

All examples above are entries to merge into the existing configuration, not complete configuration files. Thresholds live in `thresholds`; selectors/contracts live in `visualReview`. Default review severity is `policy.visualReviewSeverity: "warning"`; declared nested contradictions use `policy.declaredVisualModelSeverity: "error"`. Setting a severity to `"off"` disables its findings.

The normal validation command runs all these rules. The JSON report's `visualReviewCoverage` explicitly says screenshot image analysis is **not implemented** and manual approval is **not reviewed**. The screenshot gallery is still a manual-review aid. A zero-finding page has passed implemented rules; it has not received an automatic aesthetic, pedagogical or mathematical sign-off.
