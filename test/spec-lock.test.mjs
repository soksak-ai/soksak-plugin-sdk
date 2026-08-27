import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseSpecLock } from "../scripts/prepare-spec.mjs";

const bytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function release() {
  return {
    kind: "spec", id: "soksak-spec", version: "0.0.36",
    source: { repository: "https://github.com/soksak-ai/soksak-spec", commit: "a".repeat(40) },
    manifest: { file: "spec.json", size: 12, sha256: "b".repeat(64) },
    artifacts: [{ target: "any", file: "soksak-soksak-spec-0.0.36.tgz", size: 1234, sha256: "c".repeat(64), format: "tgz", manifest: "spec.json" }],
    evidence: [{ file: "conformance-release.json", size: 34, sha256: "d".repeat(64) }],
  };
}

test("SDK Spec lock pins one location-free release reference", () => {
  const document = release(); const encoded = bytes(document);
  const lock = {
    reference: { kind: "spec", id: "soksak-spec", version: "0.0.36", target: "any", file: document.artifacts[0].file, size: document.artifacts[0].size, sha256: document.artifacts[0].sha256 },
  };
  assert.deepEqual(parseSpecLock(lock, encoded), {
    reference: lock.reference,
    source: document.source,
    artifact: document.artifacts[0],
    package: { name: "@soksak/soksak-spec", version: "0.0.36" },
  });
  assert.equal(JSON.stringify(lock).includes("url"), false);
});

test("SDK Spec lock rejects changed release identity and unknown lock fields", () => {
  const document = release(); const encoded = bytes(document);
  const lock = {
    reference: { kind: "spec", id: "soksak-spec", version: "0.0.36", target: "any", file: document.artifacts[0].file, size: document.artifacts[0].size, sha256: document.artifacts[0].sha256 },
  };
  assert.throws(() => parseSpecLock(lock, bytes({ ...document, version: "0.0.37" })), /identity/);
  assert.throws(() => parseSpecLock({ ...lock, dependencies: [] }, encoded), /keys/);
});
