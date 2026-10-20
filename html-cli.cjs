#!/usr/bin/env node
"use strict";

// Compatibility for the documented pre-1.6.1 source entry point.
const cli = require("./src/cli/index.cjs");
if (require.main === module) cli.run();
module.exports = cli;
