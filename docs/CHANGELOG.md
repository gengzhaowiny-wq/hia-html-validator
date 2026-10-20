# Changelog

## 1.6.1 — Project structure

- Separate CLI, orchestration helpers, profile runners and browser rules under src/.
- Move the installed command into bin/; preserve all three executable names and the two documented root source entry points.
- Group default configuration, manual record template, documentation and tests into dedicated directories.
- Add architecture/contributor guides, structural regression tests and fresh-install release smoke tests.
- Add npm run package to rebuild checksummed installer ZIPs and npm tarballs into ignored dist/; remove the generated ZIP from the source root.
- Update paths and versioned examples without changing rule implementations, defaults, finding schemas or report/exit semantics.

## 1.6.0 — Packaged validator

Terminal installation, auto/general-HTML profiles, full B35 lesson traversal, LLM-friendly diagnostics and human/agent installation guidance. Project/package renamed to hia-html-validator with compatibility aliases retained.
