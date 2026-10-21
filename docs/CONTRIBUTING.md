# Contributing

Read [AGENTS.md](../AGENTS.md) for authority and data-handling constraints, [architecture](ARCHITECTURE.md) for module boundaries, and [rule documentation](RULES.md) before changing an audit.

## Local development

```bash
npm ci
node bin/hia-html-validator.cjs setup
npm test
```

Tests use trusted, synthetic fixtures and launch Chromium. They require the package dependency and matching browser, not a running desktop Chrome. Optional tests with actual lesson paths are documented in RULES.md. Do not commit private lessons, reports or screenshots.

Focused suites are available as `npm run test:cli`, `test:svg`, `test:styles`, `test:models`, `test:visual-review`, `test:page-pairs`, `test:complementary`, `test:reusability`, and `test:structure`. All are included in `npm test`. Tests return a nonzero status on failure.

For a new check, implement its browser audit under `src/rules/` (or source audit in the relevant runner), wire it into the correct profile, add configurable defaults under `config/`, and add positive, negative and intentional-exception regression cases. Preserve LLM-actionable location, observed/expected evidence, proposed action, verification and limitations. Do not clear warnings by weakening existing assertions.

## Package verification

```bash
npm run test:package
npm run package
```

The package test requires npm, tar, zip and unzip, network access or a populated npm cache for pinned dependencies, and an existing matching Chromium cache. It builds in a temporary directory, checks the allowlisted archive, installs into a temporary prefix, tests all aliases and both profiles from a different working directory, checks documentation links, and deletes only its own temporary files. It does not install Chromium or system libraries.

`npm run package` requires npm and zip. It creates `dist/hia-html-validator-VERSION.tgz`, `dist/hia-html-validator-terminal-VERSION.zip`, and `dist/SHA256SUMS`. The ZIP contains a `hia-html-validator-installer/` folder with its own checksum for the npm tarball. Verify with `shasum -a 256 -c SHA256SUMS` inside the relevant directory (or `sha256sum -c SHA256SUMS` on Linux).

Update package.json's version and regenerate package-lock.json with npm when preparing a release. Update versioned examples in README.md, AGENTS.md and docs/CLI_GUIDE.md. Re-run tests and package verification. Generated binaries belong in distribution artifacts, not the source tree. Nothing is published to npm or GitHub by these scripts; remote publication requires explicit human direction.

Changes to licensing, access, account credentials or system installation are outside the ordinary code contribution workflow. Linux/WSL installation remains unverified unless a maintainer explicitly runs and records it.
