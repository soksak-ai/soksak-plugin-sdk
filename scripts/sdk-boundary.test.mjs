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
    "docs/SIDECAR-AUTHORING.md", "docs/SIDECAR-AUTHORING.ko.md", "src/plugin.ts", "src/component-tools.ts", "bin/soksak-sdk", "sdk-spec.lock.json", "tsconfig.json",
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
  const kit = json("kit.json");
  assert.deepEqual({ name: pkg.name, version: pkg.version, private: pkg.private }, {
    name: "@soksak/soksak-sdk", version: kit.version, private: false,
  });
  assert.deepEqual(pkg.engines, { node: "26.7.0" });
  assert.equal(pkg.packageManager, "pnpm@11.24.0");
  assert.deepEqual(pkg.devEngines, { runtime: { name: "node", version: "26.7.0", onFail: "error" } });
  assert.deepEqual(pkg.exports, {
    ".": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
    "./plugin": { types: "./dist/plugin.d.ts", default: "./dist/plugin.js" },
    "./component-tools": { types: "./dist/component-tools.d.ts", default: "./dist/component-tools.js" },
  });
  const installMakefile = read("Makefile");
  assert.match(installMakefile, /^install: require-dest attest$/m);
  assert.match(installMakefile, /tar -xzf .*--strip-components=1/);
  assert.match(installMakefile, /diff -qr/);
  assert.match(installMakefile, /mv "\$\$candidate" "\$\$destination"/);
  const sidecarPolicy = read("docs/SIDECAR-AUTHORING.md");
  for (const phrase of ["domain Kit", "Contract", "generic Sidecar runtime adapter", "kind tooling"] ) {
    assert.match(sidecarPolicy, new RegExp(phrase, "i"));
  }
  assert.match(read("bin/soksak-sdk"), /command === "prepare"/);
  assert.match(read("bin/soksak-sdk"), /command === "validate"/);
  assert.deepEqual(pkg.bin, { "soksak-sdk": "bin/soksak-sdk" });
  assert.equal(existsSync(join(root, "bin/soksak-sdk.mjs")), false);
  assert.equal(pkg.soksakRelease, undefined);
  assert.deepEqual(kit, { id: "soksak-sdk", version: pkg.version });
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
    if (workflow === verifyWorkflow) {
      assert.match(workflow, /run:\s*make verify REGISTRY=https:\/\/registry[.]npmjs[.]org\//);
    }
    assert.doesNotMatch(workflow, /[.]nvmrc|pnpm install|pnpm test|@soksak-ai/);
    for (const action of [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1])) {
      assert.match(action, /^[^@\s]+@[a-f0-9]{40}$/);
    }
  }
  for (const input of ["sdk_archive_url", "sdk_archive_sha256", "sdk_release_url", "sdk_release_sha256"]) {
    assert.match(releaseWorkflow, new RegExp(`^      ${input}:$`, "m"));
  }
  assert.match(releaseWorkflow, /make attest SDK_ROOT="[$]RUNNER_TEMP\/soksak-sdk" SDK_RELEASE="[$]RUNNER_TEMP\/soksak-sdk-release[.]json" REGISTRY=https:\/\/registry[.]npmjs[.]org\//);
  assert.doesNotMatch(releaseWorkflow, /make verify package/);
  assert.equal(releaseWorkflow.includes('require(\\"'), false);
  assert.match(releaseWorkflow, /version="[$][(]node -p 'require\("[.]\/package[.]json"\)[.]version'\)"/);
  assert.match(releaseWorkflow, /[.]dependencies\/soksak-spec\/release-template\/publish-canonical-release[.]mjs/);
  assert.match(releaseWorkflow, /repositories:\s*soksak-sdk/);
  assert.match(makefile, /PACKAGE_OUT\s*[?]=\s*[$][(]CURDIR[)]\/artifacts\/[$][(]PACKAGE_VERSION[)]/);
  assert.match(makefile, /^package: verify\n\t@mkdir -p "[$][(]dir [$][(]PACKAGE_OUT[)][)]"$/m);
  for (const required of [
    "guard:", "REGISTRY", "registry_flags", "--@soksak:registry=$(REGISTRY)",
    "SPEC_RELEASE", "SPEC_ARTIFACT", "--manifest", "--artifact",
  ]) {
    assert.ok(makefile.includes(required), `Makefile is missing ${required}`);
  }
  for (const required of ["require-tooling:", "attest:", "SDK_ROOT", "SDK_RELEASE", "release.json"]) {
    assert.ok(makefile.includes(required), `SDK attestation boundary is missing ${required}`);
  }
  assert.match(makefile, /^TOOLING_SDK_VERSION := \d+\.\d+\.\d+$/m);
  for (const required of ["tooling_package_version", "tooling_release_version", "TOOLING_SDK_VERSION"]) {
    assert.ok(makefile.includes(required), `SDK tooling version check is missing ${required}`);
  }
  assert.doesNotMatch(makefile, /command -v soksak-sdk/);
  assert.match(releaseWorkflow, /--artifacts "[$]GITHUB_WORKSPACE\/artifacts\/[$]version"/);
  assert.match(releaseWorkflow, /--manifest "[$]GITHUB_WORKSPACE\/artifacts\/[$]version\/release[.]json"/);
});
