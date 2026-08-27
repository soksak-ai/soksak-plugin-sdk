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
    "docs/SIDECAR-AUTHORING.md", "docs/SIDECAR-AUTHORING.ko.md", "src/plugin.ts", "src/component-tools.ts", "bin/soksak-sdk.mjs", "sdk-spec.lock.json", "tsconfig.json",
  ]) assert.equal(existsSync(join(root, name)), true, name);
  assert.equal(existsSync(join(root, ".nvmrc")), false);
  assert.equal(existsSync(join(root, "packages/plugin-api")), false);
  for (const legacy of ["platform-dependencies.json", "soksak-spec-release.lock.json", "scripts/prepare-spec.test.mjs"]) {
    assert.equal(existsSync(join(root, legacy)), false, legacy);
  }
  for (const legacy of [
    "scripts/publish-release.mjs", "scripts/release-context.mjs", "scripts/release-verify.mjs",
    "scripts/github-api.test.mjs", "scripts/publish-assets.test.mjs", "scripts/publish-state.test.mjs",
  ]) assert.equal(existsSync(join(root, legacy)), false, legacy);

  const pkg = json("package.json");
  assert.deepEqual({ name: pkg.name, version: pkg.version, private: pkg.private }, {
    name: "@soksak/soksak-sdk", version: "0.0.7", private: true,
  });
  assert.deepEqual(pkg.engines, { node: "26.7.0" });
  assert.equal(pkg.packageManager, "pnpm@11.22.0");
  assert.deepEqual(pkg.devEngines, { runtime: { name: "node", version: "26.7.0", onFail: "error" } });
  assert.deepEqual(pkg.exports, {
    ".": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
    "./plugin": { types: "./dist/plugin.d.ts", default: "./dist/plugin.js" },
    "./component-tools": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
  });
  const sidecarPolicy = read("docs/SIDECAR-AUTHORING.md");
  for (const phrase of ["domain Kit", "Contract", "generic Sidecar runtime adapter", "kind tooling"] ) {
    assert.match(sidecarPolicy, new RegExp(phrase, "i"));
  }
  assert.match(read("bin/soksak-sdk.mjs"), /command === "prepare"/);
  assert.deepEqual(pkg.bin, { "soksak-sdk": "bin/soksak-sdk.mjs" });
  assert.equal(pkg.soksakRelease, undefined);
  assert.deepEqual(json("kit.json"), { id: "soksak-sdk", version: "0.0.7" });
  const specLock = json("sdk-spec.lock.json").reference;
  assert.equal(pkg.peerDependencies?.["@soksak/soksak-spec"], specLock.version);

  const workspace = read("pnpm-workspace.yaml");
  assert.match(workspace, /^packages:\n  - "[.]"$/m);
  for (const rule of ["engineStrict: true", "pmOnFail: error", "verifyDepsBeforeRun: error", "symlink: false"]) {
    assert.match(workspace, new RegExp(`^${rule}$`, "m"));
  }
  for (const name of ["package.json", "README.md", "README.ko.md", "pnpm-workspace.yaml"]) {
    assert.doesNotMatch(read(name), /@soksak-ai/);
  }

  const verifyWorkflow = read(".github/workflows/verify.yml");
  const releaseWorkflow = read(".github/workflows/release.yml");
  const makefile = read("Makefile");
  for (const workflow of [verifyWorkflow, releaseWorkflow]) {
    assert.match(workflow, /node-version-file:\s*[.]node-version/);
    assert.match(workflow, /package_json_file:\s*package[.]json/);
    assert.match(workflow, /run:\s*make verify/);
    assert.doesNotMatch(workflow, /[.]nvmrc|pnpm install|pnpm test|soksak-plugin-sdk|@soksak-ai/);
    for (const action of [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1])) {
      assert.match(action, /^[^@\s]+@[a-f0-9]{40}$/);
    }
  }
  assert.match(releaseWorkflow, /run:\s*make verify package\b/);
  assert.match(releaseWorkflow, /[.]dependencies\/soksak-spec\/release-template\/publish-canonical-release[.]mjs/);
  assert.match(releaseWorkflow, /repositories:\s*soksak-sdk/);
  assert.match(makefile, /PACKAGE_OUT\s*[?]=\s*[$][(]CURDIR[)]\/artifacts\/[$][(]PACKAGE_VERSION[)]/);
  assert.match(releaseWorkflow, /artifacts\/[$][(]node -p .*version.*[)]\/release[.]json/);
});
