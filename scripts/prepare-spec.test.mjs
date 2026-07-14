import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  parseArgs,
  resolveLockedSpec,
  validateArchiveEntries,
} from "./prepare-spec.mjs";

const root = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(root, "platform-dependencies.json"), "utf8"));
const manifestBytes = readFileSync(join(root, "soksak-spec-release.lock.json"));

test("locked spec resolves one exact manifest and JavaScript artifact", () => {
  const resolved = resolveLockedSpec(lock, manifestBytes);
  assert.equal(resolved.commit, "97af8080c4a9ad22121f6d43fd2ee563a6ff2ad1");
  assert.equal(resolved.manifest.sha256, lock.dependencies[0].manifest.sha256);
  assert.equal(resolved.artifact.sha256, "25a97c965e8fd83d3f7778e4eea5152ddb79d91311c4d0df18786c1e343274e8");
  assert.match(resolved.artifact.url, /\/soksak-ai-plugin-spec-0\.0\.1\.tgz$/);
});

test("dependency lock fails closed on changed manifest bytes or source", () => {
  assert.throws(
    () => resolveLockedSpec(lock, Buffer.concat([manifestBytes, Buffer.from(" ")])),
    /manifest SHA-256 mismatch/,
  );
  const changed = JSON.parse(manifestBytes.toString("utf8"));
  changed.source.commit = "b".repeat(40);
  const bytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  const changedLock = structuredClone(lock);
  changedLock.dependencies[0].manifest.sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.throws(() => resolveLockedSpec(changedLock, bytes), /unexpected spec source commit/);
});

test("dependency resolution is driven by release metadata, not the current product version", () => {
  const nextVersion = "0.7.4";
  const nextTag = `soksak-spec-v${nextVersion}`;
  const nextManifest = JSON.parse(manifestBytes.toString("utf8"));
  nextManifest.version = nextVersion;
  nextManifest.releaseTag = nextTag;
  nextManifest.packages = nextManifest.packages.map((entry) => ({
    ...entry,
    version: nextVersion,
    ...(entry.artifact ? {
      artifact: {
        ...entry.artifact,
        url: `https://github.com/soksak-ai/soksak-spec/releases/download/${nextTag}/soksak-ai-plugin-spec-${nextVersion}.tgz`,
      },
    } : {}),
  }));
  const bytes = Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`);
  const nextLock = structuredClone(lock);
  nextLock.dependencies[0].version = nextVersion;
  nextLock.dependencies[0].manifest = {
    url: `https://github.com/soksak-ai/soksak-spec/releases/download/${nextTag}/soksak-spec-release.json`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };

  const resolved = resolveLockedSpec(nextLock, bytes);
  assert.equal(resolved.version, nextVersion);
  assert.equal(resolved.releaseTag, nextTag);
  assert.match(resolved.artifact.url, /soksak-ai-plugin-spec-0\.7\.4\.tgz$/);
});

test("local overrides are an explicit absolute manifest/artifact pair", () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(
    parseArgs(["--manifest", "/a/manifest.json", "--artifact", "/a/spec.tgz"]),
    { manifest: "/a/manifest.json", artifact: "/a/spec.tgz" },
  );
  assert.throws(() => parseArgs(["--manifest", "relative.json", "--artifact", "/a/spec.tgz"]), /absolute/);
  assert.throws(() => parseArgs(["--manifest", "/a/manifest.json"]), /together/);
});

test("archive entries are unique portable regular files under package", () => {
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
      ["-rw-r--r--  0 0 0 1 Jan  1 00:00 package\/..\/escape"],
      ["package/../escape"],
    ),
    /unsafe archive path/,
  );
});
