import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

import {
  assertCleanSourceCheckout,
  assertRegularDirectory,
  finalizePackageOutput,
  runPackagingCommand,
  type ComponentPackageResult,
} from "./component-packaging.js";
import { materializedSpecScript } from "./materialized-spec.js";

export function packagePluginRelease(input: {
  root: string; specRoot: string; commit: string; store?: string; out: string;
}): ComponentPackageResult {
  const root = assertRegularDirectory(input.root, "Plugin root");
  if (!isAbsolute(input.out)) throw new Error("package output must be absolute");
  const parent = assertRegularDirectory(dirname(input.out), "package output parent");
  if (input.store !== undefined) assertRegularDirectory(input.store, "local release store");
  assertCleanSourceCheckout(root, input.commit);
  const builder = materializedSpecScript(input.specRoot, "release-template/build-release.mjs");
  const validator = materializedSpecScript(input.specRoot, "bin/validate.mjs");
  const stage = mkdtempSync(join(parent, `.${basename(input.out)}.plugin-package-`));
  try {
    runPackagingCommand(process.execPath, [
      builder, "--commit", input.commit, "--out", stage,
      ...(input.store === undefined ? [] : ["--store", input.store]),
    ], root);
    const release = join(stage, "release.json");
    runPackagingCommand(process.execPath, [validator, "release", release], root);
    const evidence = readdirSync(stage).filter((name) => /^conformance-.*[.]json$/.test(name)).sort().map((name) => join(stage, name));
    if (evidence.length === 0) throw new Error("Plugin release has no conformance evidence");
    runPackagingCommand(process.execPath, [
      validator, "conformance", ...evidence, "--release", release, "--plugin-manifest", join(root, "plugin.json"),
    ], root);
    return finalizePackageOutput(stage, input.out);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}

