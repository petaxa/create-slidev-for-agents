#!/usr/bin/env node

import { runCli } from "../src/cli";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
