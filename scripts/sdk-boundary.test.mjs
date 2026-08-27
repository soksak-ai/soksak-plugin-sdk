import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const read = (name) => readFileSync(join(root, name), "utf8");
const json = (name) => JSON.parse(read(name));

test("the SDK is one Kit with isolated Plugin and Component Tooling entrypoints", () => {
  for (const name of [
    ".node-version", "Makefile", "README.ko.md", "kit.json", "release-files.json",
    "src/plugin.ts", "src/component-tools.ts", "bin/soksak-sdk.mjs", "sdk-spec.lock.json", "tsconfig.json",
  ]) assert.equal(existsSync(join(root, name)), true, name);
  assert.equal(existsSync(join(root, ".nvmrc")), false);
  for (const legacy of ["platform-dependencies.json", "soksak-spec-release.lock.json", "scripts/prepare-spec.test.mjs"]) {
    assert.equal(existsSync(join(root, legacy)), false, legacy);
  }

  const pkg = json("package.json");
  assert.deepEqual({ name: pkg.name, version: pkg.version, private: pkg.private }, {
    name: "@soksak/soksak-sdk", version: "0.0.2", private: true,
  });
  assert.deepEqual(pkg.engines, { node: "26.7.0" });
  assert.equal(pkg.packageManager, "pnpm@11.22.0");
  assert.deepEqual(pkg.devEngines, { runtime: { name: "node", version: "26.7.0", onFail: "error" } });
  assert.deepEqual(pkg.exports, {
    ".": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
    "./plugin": { types: "./dist/plugin.d.ts", default: "./dist/plugin.js" },
    "./component-tools": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
  });
  assert.deepEqual(pkg.bin, { "soksak-sdk": "bin/soksak-sdk.mjs" });
  assert.equal(pkg.soksakRelease, undefined);
  assert.deepEqual(json("kit.json"), { id: "soksak-sdk", version: "0.0.2" });

  const workspace = read("pnpm-workspace.yaml");
  for (const rule of ["engineStrict: true", "pmOnFail: error", "verifyDepsBeforeRun: error", "symlink: false"]) {
    assert.match(workspace, new RegExp(`^${rule}$`, "m"));
  }
  for (const name of ["package.json", "README.md", "README.ko.md", "pnpm-workspace.yaml"]) {
    assert.doesNotMatch(read(name), /@soksak-ai/);
  }
});
