#!/usr/bin/env node

const [command] = process.argv.slice(2);
if (command === "--help" || command === "help") {
  process.stdout.write("soksak-sdk <inspect|verify|receipt|scaffold|package>\n");
  process.exit(0);
}
process.stderr.write("SDK_COMMAND_REQUIRED: inspect, verify, receipt, scaffold, or package\n");
process.exit(2);
