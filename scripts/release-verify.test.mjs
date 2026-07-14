import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildSdkRelease,
  resolveSourceCommit,
  sdkReleaseIdentity,
  validateArchiveEntries,
} from "./release-verify.mjs";

const root = join(import.meta.dirname, "..");
const commit = "a".repeat(40);
const digest = "1".repeat(64);

test("release source is an exact checkout commit", () => {
  assert.equal(resolveSourceCommit(commit, commit), commit);
  assert.equal(resolveSourceCommit(undefined, commit), commit);
  assert.throws(() => resolveSourceCommit("main", null), /exact lowercase 40-character/);
  assert.throws(() => resolveSourceCommit("b".repeat(40), commit), /does not equal checkout HEAD/);
});

test("SDK release projects the committed exact spec dependency", () => {
  const lock = JSON.parse(readFileSync(join(root, "platform-dependencies.json"), "utf8"));
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const sdk = JSON.parse(readFileSync(join(root, "packages/plugin-api/package.json"), "utf8"));
  const release = buildSdkRelease({
    commit,
    archiveName: "soksak-ai-plugin-api-0.0.1.tgz",
    archiveDigest: digest,
    dependencyLock: lock,
    releaseSchema: "soksak-spec-platform-release@0.0.1",
    identity: sdkReleaseIdentity(workspace, sdk),
  });
  assert.deepEqual(release.dependencies, [{
    kind: "spec",
    id: "soksak-spec",
    version: "0.0.1",
    manifest: lock.dependencies[0].manifest,
  }]);
  assert.equal(release.source.commit, commit);
  assert.equal(release.packages[0].artifact.sha256, digest);
});

test("SDK release identity is derived from metadata for later product versions", () => {
  const lock = JSON.parse(readFileSync(join(root, "platform-dependencies.json"), "utf8"));
  const workspace = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const sdk = JSON.parse(readFileSync(join(root, "packages/plugin-api/package.json"), "utf8"));
  const release = buildSdkRelease({
    commit,
    archiveName: "soksak-ai-plugin-api-0.0.1.tgz",
    archiveDigest: digest,
    dependencyLock: lock,
    releaseSchema: "soksak-spec-platform-release@0.0.1",
    identity: sdkReleaseIdentity(
      { ...workspace, version: "0.0.1" },
      { ...sdk, version: "0.0.1" },
    ),
  });

  assert.equal(release.version, "0.0.1");
  assert.equal(release.releaseTag, "soksak-plugin-sdk-v0.0.1");
  assert.match(release.packages[0].artifact.url, /soksak-ai-plugin-api-0\.9\.3\.tgz$/);
  assert.equal(release.dependencies[0].version, "0.0.1", "platform and SDK versions remain independent");
});

test("release archives contain only unique portable regular files", () => {
  assert.deepEqual(
    validateArchiveEntries(
      ["-rw-r--r--  0 0 0 1 Jan  1 00:00 package/package.json"],
      ["package/package.json"],
    ),
    ["package/package.json"],
  );
  assert.throws(
    () => validateArchiveEntries(
      ["lrwxr-xr-x  0 0 0 0 Jan  1 00:00 package/link -> target"],
      ["package/link"],
    ),
    /non-regular/,
  );
  assert.throws(
    () => validateArchiveEntries(
      ["-rw-r--r--  0 0 0 1 Jan  1 00:00 package/a"],
      ["package/../a"],
    ),
    /unsafe archive path/,
  );
});
