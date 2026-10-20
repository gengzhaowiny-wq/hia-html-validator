"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const pkg = require("../package.json");
const results = [];
const skipped = [];
const { packEntries } = require("../scripts/package.cjs");
function test(name, fn) { fn(); results.push(name); }
function command(file, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, file), ...args], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

test("maintained components have dedicated directories", () => {
  for (const name of ["bin", "src/cli", "src/core", "src/validators", "src/rules", "tests", "scripts", "config", "docs", "templates"]) {
    assert.ok(fs.statSync(path.join(root, name)).isDirectory(), name);
  }
});
test("all command aliases resolve to the thin executable", () => {
  for (const name of ["hia-html-validator", "html-validate-b35", "b35-validate"]) {
    assert.equal(pkg.bin[name], "bin/hia-html-validator.cjs");
  }
  assert.equal(command(pkg.bin[pkg.name], ["--version"]).trim(), pkg.version);
});
test("legacy source CLI works outside the project directory", () => {
  assert.equal(command("html-cli.cjs", ["--version"]).trim(), pkg.version);
  assert.equal(require("../html-cli.cjs").parse, require("../src/cli/index.cjs").parse);
});
test("legacy lesson source command still provides help", () => {
  assert.match(command("validate-b35.cjs", ["--help"]), /Usage:/);
});
test("default configuration is independent of the working directory", () => {
  const result = spawnSync(process.execPath, ["-e", "const c=require(process.argv[1]).configuration(null,'lesson');if(c.viewport.width!==960)process.exit(1)", path.join(root, "src/core/cli-support.cjs")], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
test("all local documentation links resolve after the moves", () => {
  for (const file of [path.join(root, "README.md"), path.join(root, "AGENTS.md"), ...files(path.join(root, "docs")), ...files(path.join(root, "templates"))]) {
    if (!file.endsWith(".md")) continue;
    for (const match of fs.readFileSync(file, "utf8").matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(match[1])) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(match[1].split("#")[0]))), `${file}: ${match[1]}`);
    }
  }
});
if (fs.existsSync(path.join(root, "package-lock.json"))) test("package metadata and lockfile agree on version and commands", () => {
  const lock = require("../package-lock.json");
  assert.equal(lock.name, pkg.name); assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.deepEqual(lock.packages[""].bin, pkg.bin);
});
else skipped.push("Lockfile check: npm intentionally excludes package-lock.json from installed tarballs.");
test("JavaScript entry points and modules have valid syntax", () => {
  for (const directory of ["bin", "src", "tests", "scripts"]) {
    for (const file of files(path.join(root, directory)).filter(name => name.endsWith(".cjs"))) {
      const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      assert.equal(result.status, 0, `${file}: ${result.stderr}`);
    }
  }
});
test("packaging understands both supported npm JSON formats", () => {
  const entry = { name: pkg.name, version: pkg.version };
  assert.deepEqual(packEntries([entry]), [entry]);
  assert.deepEqual(packEntries({ [pkg.name]: entry }), [entry]);
});
console.log(JSON.stringify({ passed: results.length, failed: 0, tests: results, skipped }, null, 2));
