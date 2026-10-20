"use strict";
const path = require("node:path");
const { spawnSync } = require("node:child_process");
for (const file of ["test-structure.cjs", "test-svg-formulas.cjs", "test-formula-styles.cjs", "test-visual-models.cjs", "test-visual-review.cjs", "test-page-pairs.cjs", "test-complementary.cjs", "test-cli.cjs"]) {
  const args = file === "test-formula-styles.cjs" ? [] : process.argv.slice(2);
  const outputIndex = args.indexOf("--out");
  if (["test-visual-models.cjs", "test-visual-review.cjs", "test-page-pairs.cjs", "test-complementary.cjs"].includes(file) && outputIndex >= 0) {
    const original = args[outputIndex + 1];
    const extension = path.extname(original);
    const suffix = {"test-visual-models.cjs":"-models","test-visual-review.cjs":"-visual-review","test-page-pairs.cjs":"-page-pairs","test-complementary.cjs":"-complementary"}[file];
    args[outputIndex + 1] = original.slice(0, original.length - extension.length) + suffix + extension;
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, "../tests", file), ...args], { stdio: "inherit" });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
