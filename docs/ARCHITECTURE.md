# Architecture

This is a plain CommonJS/Node.js command-line package. There is no compilation step or frontend framework. Node.js 20+ and the package's pinned Playwright dependency are required; Chromium is installed separately with `hia-html-validator setup`.

## Runtime flow

`bin/hia-html-validator.cjs` delegates to `src/cli/index.cjs`, which parses arguments, discovers input files, resolves the profile/configuration, and starts one bounded child process per file. `src/core/cli-support.cjs` owns profile defaults, configuration merging and generic report helpers.

The child runner is either `src/validators/lesson.cjs` (compatible B35 lesson navigation and reveals) or `src/validators/html.cjs` (one current document state). The runners call the browser audit functions in `src/rules/`. These functions must remain self-contained when serialized into the browser by Playwright: do not add Node imports or references to module-local variables inside the evaluated function.

`config/b35.rules.json` is the canonical default configuration. User overrides merge over these defaults through the primary CLI; arrays replace arrays. Rule IDs, selectors, finding evidence, exit codes and report schema are unchanged by the 1.6.1 directory reorganisation.

## Compatibility

All three installed names (`hia-html-validator`, `html-validate-b35`, `b35-validate`) map to the same thin executable. Root `html-cli.cjs` re-exports the CLI helpers and still supports `node html-cli.cjs`. Root `validate-b35.cjs` preserves the original lesson-only command, including `npm run validate`. The preferred general/auto command from source is `node bin/hia-html-validator.cjs`, also available through `npm run validate:html -- ...`.

Direct file imports from the former flat layout, other than the documented CLI shim, are not a supported public API. Default configuration and template files have moved into `config/` and `templates/`; update any source-relative paths in local scripts.

## Tests and releases

`tests/` contains synthetic browser fixtures inside the test modules; private lesson HTML is never required for the default suite. Optional real-lesson regressions accept explicitly supplied paths. `scripts/test.cjs` runs all ordinary regression suites and forwards their existing optional arguments.

`scripts/package.cjs` uses the explicit npm package allowlist to produce a tarball, then copies the human/agent docs, template and installer into a ZIP bundle. Generated outputs go to ignored `dist/`. The version comes from package.json rather than being duplicated in install.sh. `tests/test-package.cjs` separately checks the built archive and a fresh-prefix installation.

## Safety boundaries

The validator flags issues; it does not repair inputs or approve screenshots. Source-only mode is not rendered validation. Offline mode is not an OS security sandbox. No accessibility checks, automatic AI image review, npm publication, license changes or private lesson uploads are introduced by this structure.
