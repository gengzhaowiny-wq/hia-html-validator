# Install and run from Terminal

The package provides **`hia-html-validator`** (compatibility aliases **`html-validate-b35`** and **`b35-validate`**). It does not require Codex, Python, a desktop sandbox setting, or a running Chrome session.

## Install once

Requires Node.js **20 or newer** and npm on your PATH. The bash installer targets macOS/Linux terminals; use WSL for this bash workflow on Windows. If missing, install Node.js from [nodejs.org](https://nodejs.org/), then reopen Terminal.

Extract the supplied installer bundle and run from its directory:

```bash
bash install.sh
```

This installs into your user-owned `$HOME/.local` prefix and installs Playwright's Chromium. It does not use sudo, edit your shell startup files, or install a system Node.js. Follow the printed PATH instruction if needed:

```bash
export PATH="$HOME/.local/bin:$PATH"
hia-html-validator doctor
```

To retain that PATH in future terminals, add the export yourself to the startup file for your shell (`~/.zshrc` for interactive zsh; `~/.bashrc` for interactive bash). Alternatively, run `$HOME/.local/bin/hia-html-validator` directly.

Already using a suitable npm global prefix? The package tarball alone can be installed with:

```bash
npm install -g ./hia-html-validator-1.6.1.tgz
hia-html-validator setup
hia-html-validator doctor
```

On Linux, missing browser system libraries may require `hia-html-validator setup --with-deps`; that explicitly requested operation can ask for OS-level administrative access. Browser setup downloads a Chromium build matching the pinned Playwright dependency. Installation requires network access. The package is not published to an npm registry: use the supplied local tarball, not `npm install -g hia-html-validator`.

## Validate one file

```bash
hia-html-validator "/path/to/lesson.html"
```

Reports are written to `lesson-b35-report/` in the current working directory. Your input file is never edited. Use a separate output folder when desired:

```bash
hia-html-validator "/path/to/lesson.html" --out "./results/ch08"
```

Open `report.md` for the findings, `report.json` for LLM/tool processing, and `visual-review.html` for screenshots. `run.json` records version/profile/exit status; `resolved-config.json` records effective thresholds and switches.

Use quotes around paths containing spaces. These examples are shell commands, not commands to paste into an HTML file.

## Any local HTML: understand the two profiles

| Profile | Use | Coverage |
|---|---|---|
| `auto` (default) | Most runs | Selects `lesson` when section/div `.slide` markup is found; otherwise `html`. |
| `lesson` | Compatible HI Academy/B35 decks such as Ch06–Ch08 | Existing full navigation/reveal, page-pair, formula, footer, diagram, composition and runtime checks. Requires the expected `.slide`, `.hdr`, `.body`, `.nav`, `#next`, `#counter`, `#step` shell. |
| `html` | Other local `.html`/`.htm` pages | Current rendered document: horizontal overflow, clipped text-container review, duplicate IDs, broken assets, script failures, SVG scaling review and the reusable mathematical presentation checks. |

```bash
hia-html-validator page.html --profile html --viewport 1280x800
hia-html-validator lesson.html --profile lesson --viewport 960x540
```

**General mode is not a universal presentation-engine adapter.** It does not click every control or traverse arbitrary hidden slides, frames or shadow DOM. Its report explicitly states current-state coverage and flags recognised reveal/frame content for follow-up. Use an adapter/manual review for Reveal.js, bespoke navigation, asynchronous interaction or other engines. A file that looks like a lesson but lacks its shell fails/reports incomplete rather than silently passing as a B35 deck; force `--profile html` only when you intend current-document coverage.

General mode does not impose dark task cards, a classroom-wide 18px floor, full-MathML authoring, or centred footers on arbitrary websites. Maths/style checks are reused where relevant. Footer groups must be explicitly marked with `data-b35-footer-group`, and centring/minimum sizes must be configured. Symbol-stroke warnings still require real visual review, not merely identical CSS weights. Custom configuration can opt into stricter authoring rules.

The tool is a layout/maths diagnostic pipeline, **not an HTML/CSS standards-conformance validator or mathematical proof engine**. Browsers can repair malformed HTML, so a rendered pass does not prove valid source syntax. No accessibility suite is added. No automatic content fixes, AI screenshot analysis or automatic B35 approval are performed.

## Several files or a folder

```bash
hia-html-validator ./lessons/*.html --out ./results
hia-html-validator ./lessons --recursive --out ./results
```

Without `--recursive`, a directory supplies its top-level HTML files only. Batch reports get per-file subfolders with a short path hash so identical basenames do not collide. `batch-summary.json` gives all results and their individual exit statuses. The batch continues after a file has findings. Hidden directories, `node_modules`, recognised report folders and the explicitly selected output tree are excluded from recursive discovery; directory symlinks are not followed. Input order is deterministic within directory scans.

## Useful switches

```bash
# Fail CI for warnings as well as errors
hia-html-validator lesson.html --fail-on-warning

# Source checks only: no browser, NO rendered-layout assurance
hia-html-validator lesson.html --static-only

# Browser checks, but no image evidence
hia-html-validator lesson.html --no-screenshots

# Disable external HTTP(S), WebSocket and service-worker access
hia-html-validator lesson.html --offline

# Per-file process time limit in milliseconds (default five minutes)
hia-html-validator lesson.html --timeout 600000
```

`--offline` can cause fallback fonts/missing remote images, and these resource failures remain in the report. Neither offline mode nor Chromium's isolated temporary profile is an OS security sandbox. **Only run browser validation on HTML you trust:** it executes the file's scripts. External requests are allowed by default to retain the existing font/asset behaviour. In an untrusted environment use a separate container/VM with filesystem/network restrictions; do not assume this command provides that containment. Source-only mode avoids browser execution but has much less coverage.

Exit codes:

- `0`: no automated errors (or no source-preflight errors in static-only mode); warnings and manual review may remain.
- `1`: errors found, or warnings found with `--fail-on-warning`.
- `2`: invalid invocation, missing dependency/browser, timeout or incomplete validation. Do not accept a prior report in place of this run.

## Add or tune rules

```bash
hia-html-validator init-config ./my-rules.json
hia-html-validator lesson.html --config ./my-rules.json
```

The generated file contains minimal editable overrides and refuses to overwrite an existing file. Objects merge over the selected profile's defaults; arrays replace the whole default array. Example:

```json
{
  "thresholds": {
    "formulaMaximumFontSizeRatio": 1.15,
    "footerContentCenterTolerancePx": 2
  },
  "policy": {
    "footerTypographySeverity": "warning",
    "footerAlignmentSeverity": "warning",
    "symbolRenderingSeverity": "warning"
  }
}
```

The full rule settings and browser-audit extension points remain in the included [rule documentation](RULES.md) and `config/b35.rules.json`. New logic can be added to the shipped rule modules with regression tests, then repackaged. This version does not load arbitrary external plugins from a config file. Trust any JavaScript rule extension as code. For symbol-review approvals, follow the evidence/fingerprint requirements in the rule documentation—do not manufacture an approval to remove a warning.

## Troubleshooting and removal

```bash
hia-html-validator --help
hia-html-validator doctor
hia-html-validator setup
```

`doctor` checks Node/dependency/browser-file availability, not whether your OS can launch Chromium. A real browser run is the launch test. Install after updating the tarball and rerun setup so the browser matches Playwright. Dynamic import/fetch of local ES modules can be restricted by `file://` browser rules; this version validates local files, not served URLs. Keep relative assets beside the HTML. Configure/run another viewport explicitly when testing responsiveness.

Remove a user-prefix installation with:

```bash
npm uninstall -g --prefix "$HOME/.local" hia-html-validator
```

Reports and source HTML are not deleted by uninstalling. Chromium's shared Playwright cache is also retained; the installer never deletes it.

Reference: [Playwright browser setup](https://playwright.dev/docs/browsers), [npm executable-package configuration](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin).
