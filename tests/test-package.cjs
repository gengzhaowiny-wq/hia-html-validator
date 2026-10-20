"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { build, digest } = require("../scripts/package.cjs");
const pkg = require("../package.json");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hia package smoke "));
const results = [];
function test(name, fn) { fn(); results.push(name); }
try {
  const output = path.join(temporary, "artifacts");
  const release = build(output);
  const archive = path.join(output, `${pkg.name}-${pkg.version}.tgz`);
  const zip = path.join(output, `${pkg.name}-terminal-${pkg.version}.zip`);
  test("package build creates the versioned tarball, ZIP and checksums", () => {
    assert.equal(release.version, pkg.version);
    for (const file of release.files) assert.ok(fs.statSync(path.join(output, file)).size > 0);
    for (const line of fs.readFileSync(path.join(output, "SHA256SUMS"), "utf8").trim().split("\n")) {
      const [hash, name] = line.split(/\s+/); assert.equal(hash, digest(path.join(output, name)));
    }
  });
  const inventory = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  test("npm archive contains every relocated runtime component and agent docs", () => {
    for (const name of ["bin/hia-html-validator.cjs", "src/cli/index.cjs", "src/core/cli-support.cjs", "src/validators/lesson.cjs", "src/validators/html.cjs", "src/rules/complementary-rules.cjs", "config/b35.rules.json", "templates/b35-acceptance-template.md", "README.md", "AGENTS.md", "docs/CLI_GUIDE.md", "tests/test-cli.cjs", "scripts/test.cjs"]) {
      assert.ok(inventory.includes(`package/${name}`), name);
    }
    assert.ok(!inventory.some(name => /(?:^|\/)(?:node_modules|dist|private|lessons|test-results)\//.test(name)));
    assert.ok(!inventory.some(name => /\.(?:html|zip|tgz)$/.test(name)));
  });
  test("installer ZIP has a valid inventory and matching tarball checksum", () => {
    execFileSync("unzip", ["-tq", zip]);
    const unpacked = path.join(temporary, "unpacked");
    execFileSync("unzip", ["-q", zip, "-d", unpacked]);
    const bundle = path.join(unpacked, "hia-html-validator-installer");
    assert.equal(digest(path.join(bundle, path.basename(archive))), digest(archive));
    assert.ok(fs.readFileSync(path.join(bundle, "SHA256SUMS"), "utf8").startsWith(digest(archive)));
    for (const name of ["install.sh", "AGENTS.md", "README.md", "docs/CLI_GUIDE.md", "docs/RULES.md"]) assert.ok(fs.existsSync(path.join(bundle, name)), name);
    execFileSync("bash", ["-n", path.join(bundle, "install.sh")]);
  });
  const prefix = path.join(temporary, "installed prefix");
  test("bash installer installs the generated bundle into a test-owned prefix", () => {
    const installerEnvironment = { ...process.env, npm_config_ignore_scripts: "true" };
    if (process.env.npm_execpath) {
      const shim = path.join(temporary, "npm shim");
      fs.mkdirSync(shim);
      fs.symlinkSync(process.env.npm_execpath, path.join(shim, "npm"));
      installerEnvironment.PATH = `${shim}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`;
    }
    execFileSync("bash", [path.join(temporary, "unpacked/hia-html-validator-installer/install.sh"), "--prefix", prefix, "--skip-browser"], { cwd: temporary, env: installerEnvironment });
    assert.ok(fs.existsSync(path.join(prefix, "bin", pkg.name)));
  });
  const environment = { ...process.env };
  delete environment.NODE_PATH;
  function installed(args) {
    const result = spawnSync(process.execPath, [path.join(prefix, "bin", pkg.name), ...args], { cwd: temporary, env: environment, encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result;
  }
  test("fresh-prefix command aliases run without NODE_PATH", () => {
    for (const name of Object.keys(pkg.bin)) {
      const result = spawnSync(process.execPath, [path.join(prefix, "bin", name), "--version"], { cwd: temporary, env: environment, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), pkg.version);
    }
  });
  test("installed dependency and browser availability checks work", () => {
    const doctor = JSON.parse(installed(["doctor"]).stdout);
    assert.ok(doctor.chromiumInstalled); assert.equal(doctor.playwright, pkg.dependencies.playwright);
  });
  test("fresh install renders general HTML and writes screenshot evidence", () => {
    const input = path.join(temporary, "trusted fixture.html");
    const html = '<!doctype html><html><meta charset="utf-8"><title>Smoke</title><body><h1>Trusted package fixture</h1><p>Readable content</p></body></html>';
    fs.writeFileSync(input, html);
    const out = path.join(temporary, "html report");
    installed([input, "--out", out]);
    const report = JSON.parse(fs.readFileSync(path.join(out, "report.json")));
    assert.equal(report.coverage.profile, "html"); assert.equal(report.browser.status, "COMPLETED");
    assert.equal(report.summary.errors, 0); assert.ok(fs.existsSync(path.join(out, "screenshots/document.png")));
    assert.equal(fs.readFileSync(input, "utf8"), html);
  });
  test("fresh install resolves the moved lesson runner and default configuration", () => {
    const input = path.join(temporary, "trusted lesson.html");
    fs.writeFileSync(input, '<!doctype html><html><meta charset="utf-8"><title>Lesson smoke</title><body><section class="slide" id="s1">Fixture</section></body></html>');
    const out = path.join(temporary, "lesson report");
    const result = spawnSync(process.execPath, [path.join(prefix, "bin", pkg.name), input, "--static-only", "--out", out], { cwd: temporary, env: environment, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(out, "report.json")));
    assert.equal(report.coverage.profile, "lesson");
    assert.ok(report.findings.some(item => item.rule === "B35-SOURCE-001"));
    assert.notEqual(report.browser.status, "BLOCKED");
  });
  test("fresh install traverses both lesson pages and all three reveal states", () => {
    const input = path.join(temporary, "navigation fixture.html");
    fs.writeFileSync(input, require("./fixtures/lesson.cjs"));
    const out = path.join(temporary, "lesson browser report");
    const result = spawnSync(process.execPath, [path.join(prefix, "bin", pkg.name), input, "--out", out], { cwd: temporary, env: environment, encoding: "utf8", timeout: 60000 });
    assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(out, "report.json")));
    assert.equal(report.browser.status, "COMPLETED");
    assert.equal(report.metrics.runtimeSlides, 2); assert.equal(report.metrics.revealStatesInspected, 3);
    assert.equal(report.metrics.screenshotsCaptured, 3);
  });
  test("installed package can run structure tests and resolve documentation links", () => {
    const installedRoot = path.join(prefix, "lib/node_modules", pkg.name);
    const result = spawnSync(process.execPath, [path.join(installedRoot, "tests/test-structure.cjs")], { cwd: temporary, env: environment, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
  console.log(JSON.stringify({ passed: results.length, failed: 0, tests: results }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
