import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "0.0.1";

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function symbolicLinks(at, prefix = "") {
  if (!existsSync(at)) return [];
  const links = [];
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) links.push(relative);
    else if (stat.isDirectory()) links.push(...symbolicLinks(path, relative));
  }
  return links;
}

test("repository owns a reproducible GitHub-only SDK boundary", () => {
  for (const path of [
    ".github/workflows/release.yml",
    ".github/workflows/verify.yml",
    ".gitignore",
    ".nvmrc",
    "LICENSE",
    "README.md",
    "package.json",
    "packages/plugin-api/package.json",
    "platform-dependencies.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/prepare-spec.mjs",
    "scripts/publish-release.mjs",
    "scripts/release-context.mjs",
    "scripts/release-verify.mjs",
    "soksak-spec-release.lock.json",
    "vitest.config.mjs",
  ]) {
    assert.equal(existsSync(join(root, path)), true, `required repository file: ${path}`);
  }

  const workspace = json("package.json");
  assert.equal(workspace.version, baseline);
  assert.equal(workspace.private, true);
  assert.equal(workspace.packageManager, "pnpm@10.30.3");
  assert.equal(workspace.scripts?.["dependencies:prepare"], "node scripts/prepare-spec.mjs");
  assert.equal(workspace.scripts?.prepare, undefined, "dependency preparation is never an install lifecycle side effect");
  assert.equal(workspace.scripts?.test, "pnpm test:unit && pnpm release:verify");
  assert.deepEqual(workspace.soksakRelease, {
    kind: "sdk",
    id: "soksak-plugin-sdk",
    repository: "https://github.com/soksak-ai/soksak-plugin-sdk",
    manifest: "soksak-plugin-sdk-release.json",
  });

  const sdk = json("packages/plugin-api/package.json");
  assert.equal(sdk.version, baseline);
  assert.equal(sdk.private, true);
  assert.equal(sdk.publishConfig, undefined);
  assert.deepEqual(sdk.peerDependencies, { "@soksak-ai/plugin-spec": baseline });

  const lock = json("platform-dependencies.json");
  assert.equal(lock.schema, "soksak-platform-dependency-lock@0.0.1");
  assert.equal(lock.dependencies.length, 1);
  const dependency = lock.dependencies[0];
  assert.deepEqual(
    { kind: dependency.kind, id: dependency.id, version: dependency.version },
    { kind: "spec", id: "soksak-spec", version: baseline },
  );
  assert.equal(dependency.manifest.sha256, sha256("soksak-spec-release.lock.json"));
  assert.equal(
    dependency.manifest.url,
    "https://github.com/soksak-ai/soksak-spec/releases/download/soksak-spec-v0.0.1/soksak-spec-release.json",
  );
  const specRelease = json("soksak-spec-release.lock.json");
  assert.equal(specRelease.source.commit, "de3586a18f3a439aad0c63eeab9d877681a4bab0");
  assert.deepEqual(specRelease.dependencies, []);
  assert.equal(specRelease.packages[0].artifact.sha256, "c7c9c27488b24aeb87df8d64311e3f4f70b950a129ef78462e592c9f08824a81");

  for (const workflow of [".github/workflows/release.yml", ".github/workflows/verify.yml"]) {
    const uses = [...read(workflow).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
    assert.ok(uses.length > 0, `${workflow}: actions required`);
    for (const action of uses) {
      assert.match(action, /^[^@\s]+@[a-f0-9]{40}$/, `${workflow}: full action commit required`);
    }
  }

  const releaseWorkflow = read(".github/workflows/release.yml");
  assert.match(releaseWorkflow, /\bon:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(releaseWorkflow, /\btags:/);
  assert.doesNotMatch(releaseWorkflow, /(?:^|[^A-Z_])v?0\.0\.1(?:$|[^0-9])/m, "workflow never owns a product version");
  assert.match(releaseWorkflow, /permission-administration:\s*read/);
  assert.match(releaseWorkflow, /permission-contents:\s*write/);
  assert.match(releaseWorkflow, /SOKSAK_RELEASE_TOKEN:/);
  assert.doesNotMatch(releaseWorkflow, /\bGITHUB_TOKEN\b/);
  assert.match(
    releaseWorkflow,
    /actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1/,
  );

  for (const script of ["scripts/prepare-spec.mjs", "scripts/release-verify.mjs", "scripts/publish-release.mjs"]) {
    const source = read(script);
    assert.doesNotMatch(source, /\bconst\s+(?:VERSION|version|TAG|tag)\s*=\s*["'](?:v?0\.0\.1)["']/);
    assert.doesNotMatch(source, /\.version\s*!==\s*["']0\.0\.1["']/);
  }

  const scripts = Object.entries(workspace.scripts ?? {});
  assert.equal(
    scripts.some(([name, command]) => /publish/i.test(name) || /(?:npm|pnpm)\s+publish/.test(String(command))),
    false,
  );
  assert.deepEqual(symbolicLinks(root), [], "repository and installed dependencies contain no symbolic links");
});
