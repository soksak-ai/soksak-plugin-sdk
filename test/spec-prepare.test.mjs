import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test, { afterEach } from "node:test";

import { prepareSpecDependency, readPreparedSpecDependency } from "../scripts/prepare-spec.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-spec-prepare-")); roots.push(root);
  const source = join(root, "archive", "package"); mkdirSync(join(source, "bin"), { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "@soksak/soksak-spec", version: "0.0.36", publishConfig: { access: "public" } }));
  writeFileSync(join(source, "bin/validate.mjs"), "#!/usr/bin/env node\nprocess.exit(process.argv[2] === 'release' ? 0 : 7);\n");
  chmodSync(join(source, "bin/validate.mjs"), 0o755);
  const artifactPath = join(root, "soksak-soksak-spec-0.0.36.tgz");
  const packed = spawnSync("tar", ["-czf", artifactPath, "-C", join(root, "archive"), "package"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  const artifact = readFileSync(artifactPath);
  const release = {
    kind: "spec", id: "soksak-spec", version: "0.0.36",
    source: { repository: "https://github.com/soksak-ai/soksak-spec", commit: "a".repeat(40) },
    manifest: { file: "spec.json", size: 12, sha256: "b".repeat(64) },
    artifacts: [{ target: "any", file: "soksak-soksak-spec-0.0.36.tgz", size: artifact.length, sha256: sha256(artifact), format: "tgz", manifest: "spec.json" }],
    evidence: [{ file: "conformance-release.json", size: 34, sha256: "d".repeat(64) }],
  };
  const releaseBytes = Buffer.from(`${JSON.stringify(release)}\n`); const releasePath = join(root, "release.json"); writeFileSync(releasePath, releaseBytes);
  const lock = { reference: { kind: "spec", id: "soksak-spec", version: "0.0.36", target: "any", file: release.artifacts[0].file, size: release.artifacts[0].size, sha256: release.artifacts[0].sha256 } };
  const lockPath = join(root, "sdk-spec.lock.json"); writeFileSync(lockPath, `${JSON.stringify(lock)}\n`);
  return { root, lockPath, releasePath, artifactPath };
}

test("preparation materializes exact current Spec bytes idempotently without a legacy release format", async () => {
  const value = fixture();
  const first = await prepareSpecDependency({ root: value.root, lock: value.lockPath, manifest: value.releasePath, artifact: value.artifactPath });
  const second = await prepareSpecDependency({ root: value.root, lock: value.lockPath, manifest: value.releasePath, artifact: value.artifactPath });
  assert.equal(first.destination, join(value.root, ".dependencies/soksak-spec"));
  assert.deepEqual(second, first);
  assert.equal(JSON.parse(readFileSync(join(first.destination, "package.json"), "utf8")).name, "@soksak/soksak-spec");
  assert.deepEqual(readFileSync(join(first.destination, ".soksak-release.json")), readFileSync(value.releasePath));
});

test("preparation rejects artifact drift", async () => {
  const value = fixture(); writeFileSync(value.artifactPath, "changed");
  await assert.rejects(() => prepareSpecDependency({ root: value.root, lock: value.lockPath, manifest: value.releasePath, artifact: value.artifactPath }), /artifact SHA-256/);
});

test("preparation reuses only a lock-matched and byte-exact materialized Spec tree", async () => {
  const value = fixture();
  const prepared = await prepareSpecDependency({ root: value.root, lock: value.lockPath, manifest: value.releasePath, artifact: value.artifactPath });
  assert.deepEqual(readPreparedSpecDependency({ root: value.root, lock: value.lockPath }), prepared);
  writeFileSync(join(prepared.destination, "package.json"), JSON.stringify({ name: "@soksak/soksak-spec", version: "0.0.36", changed: true }));
  assert.equal(readPreparedSpecDependency({ root: value.root, lock: value.lockPath }), null);
});
