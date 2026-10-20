"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const pkg = require("../package.json");

function npm(args, options = {}) {
  const executable = process.env.npm_execpath;
  return execFileSync(executable ? process.execPath : "npm", executable ? [executable, ...args] : args, {
    cwd: root, encoding: "utf8", ...options
  });
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function packEntries(result) {
  // npm <=11 emits an array; npm 12 emits a package-name-keyed object.
  return Array.isArray(result) ? result : Object.values(result);
}

function build(output = path.join(root, "dist")) {
  const destination = path.resolve(output);
  if (destination === root || destination === os.homedir() || destination === path.parse(destination).root) {
    throw new Error("Choose a specific generated-artifact directory, not the source root, home or filesystem root.");
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "hia-package-"));
  try {
    const packed = packEntries(JSON.parse(npm(["pack", "--json", "--ignore-scripts", "--pack-destination", stage])));
    if (packed.length !== 1 || packed[0].name !== pkg.name || packed[0].version !== pkg.version) {
      throw new Error("npm pack returned unexpected package metadata.");
    }
    const archive = packed[0].filename;
    if (path.basename(archive) !== archive) throw new Error("Unexpected archive path.");
    const bundleName = "hia-html-validator-installer";
    const bundle = path.join(stage, bundleName);
    fs.mkdirSync(bundle);
    for (const name of ["README.md", "AGENTS.md", "docs", "templates"]) {
      fs.cpSync(path.join(root, name), path.join(bundle, name), { recursive: true });
    }
    fs.copyFileSync(path.join(root, "scripts/install.sh"), path.join(bundle, "install.sh"));
    fs.copyFileSync(path.join(stage, archive), path.join(bundle, archive));
    fs.writeFileSync(path.join(bundle, "SHA256SUMS"), `${digest(path.join(bundle, archive))}  ${archive}\n`);
    fs.writeFileSync(path.join(bundle, "RELEASE.json"), JSON.stringify({
      name: pkg.name, version: pkg.version, package: archive,
      note: "Built locally. Checksums detect corruption, not publisher authenticity. No automatic validation acceptance."
    }, null, 2) + "\n");
    const zip = `${pkg.name}-terminal-${pkg.version}.zip`;
    execFileSync("zip", ["-qrX", path.join(stage, zip), bundleName], { cwd: stage });
    fs.mkdirSync(destination, { recursive: true });
    for (const name of [archive, zip]) fs.copyFileSync(path.join(stage, name), path.join(destination, name));
    fs.writeFileSync(path.join(destination, "SHA256SUMS"), [archive, zip].map(name => `${digest(path.join(destination, name))}  ${name}`).join("\n") + "\n");
    return { name: pkg.name, version: pkg.version, output: destination, files: [archive, zip, "SHA256SUMS"] };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--out")) throw new Error("Usage: npm run package -- [--out DIRECTORY]");
    console.log(JSON.stringify(build(args[1]), null, 2));
  } catch (error) {
    console.error(`Package build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { build, npm, digest, packEntries };
