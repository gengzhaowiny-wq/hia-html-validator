# Refactor verification — 1.6.1

Verified locally on macOS with Node.js 24.19.0, npm 12.2.0 and pinned Playwright 1.62.1. A matching Chromium cache was already available. No system software, shell startup files or real global package prefix was changed.

- All 294 existing regression cases pass after moving source and tests.
- Nine additional structure cases pass: directory boundaries, executable aliases, legacy CLI imports/commands, working-directory independence, documentation links, lockfile metadata, JavaScript syntax and both npm pack JSON formats.
- Ten release smoke cases pass: artifact generation/checksums, npm and ZIP inventories, bash installation into a temporary prefix with spaces, all three installed aliases, dependency/browser availability, general-HTML rendering with screenshot evidence, lesson source preflight, lesson browser traversal, and installed-package structure/docs checks.
- The synthetic lesson smoke test covers two displayed pages, three reveal states and three screenshots. Test fixture findings are not evidence of visual approval; the test checks complete traversal and report generation.
- Tests of the installed commands unset NODE_PATH, preventing reliance on unrelated global dependencies.
- All six rule modules and config/b35.rules.json are byte-identical to the pre-refactor release. No thresholds, rule IDs, formula presentation policy, report acceptance rules or accessibility coverage changed.
- The root compatibility entry points remain available. Package binaries all use bin/hia-html-validator.cjs; source/default-config paths no longer depend on the current working directory.
- Generated tarballs, ZIPs, node_modules and reports are excluded from the source tree's Git inventory. No private lesson content or reports are packaged.

The new package builder was exercised with npm 12's object-shaped JSON; its compatibility with older npm array-shaped output is covered by a unit case, not a separate old-npm runtime installation. Linux/WSL, first-time Chromium downloads, automatic visual acceptance and mathematical correctness remain unverified. No package is published to npm by these checks or scripts.
