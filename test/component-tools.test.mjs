import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import {
  createComponentBuildReceipt,
  inspectComponentRoot,
  writeComponentBuildReceipt,
} from "../dist/component-tools.js";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const temporary = () => { const root = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-tools-")); roots.push(root); return root; };
const bytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);

function release(kind, id = `soksak-${kind}-example`) {
  const target = kind === "sidecar" ? "aarch64-apple-darwin" : "any";
  return {
    kind, id, version: "1.2.3",
    source: { repository: `https://github.com/soksak-ai/${id}`, commit: "a".repeat(40) },
    manifest: { file: `${kind}.json`, size: 12, sha256: "b".repeat(64) },
    artifacts: [{ target, file: `${id}-1.2.3-${target}.${kind === "sidecar" ? "tar.gz" : "tgz"}`, size: 34, sha256: "c".repeat(64), format: kind === "sidecar" ? "tar.gz" : "tgz", manifest: `${kind}.json` }],
    evidence: [{ file: "conformance-release.json", size: 56, sha256: "d".repeat(64) }],
  };
}

test("inspect discovers exactly one component manifest without requiring Git", () => {
  const root = temporary(); mkdirSync(join(root, "frontend"));
  writeFileSync(join(root, "plugin.json"), JSON.stringify({ id: "soksak-plugin-example", version: "1.2.3" }));
  writeFileSync(join(root, "frontend/package.json"), JSON.stringify({ name: "@soksak/soksak-plugin-example", version: "1.2.3" }));
  assert.deepEqual(inspectComponentRoot(root), {
    root, kind: "plugin", id: "soksak-plugin-example", version: "1.2.3",
    manifest: join(root, "plugin.json"), package: join(root, "frontend/package.json"),
  });
  writeFileSync(join(root, "kit.json"), JSON.stringify({ id: "soksak-kit-example", version: "1.2.3" }));
  assert.throws(() => inspectComponentRoot(root), /exactly one component manifest/);
});

test("receipt binds release, Spec, SDK, environment, and exact tools without an SDK dependency field", () => {
  const component = release("kit", "soksak-kit-example");
  const spec = release("spec", "soksak-spec");
  const sdk = release("kit", "soksak-sdk"); sdk.version = "0.0.2";
  const receipt = createComponentBuildReceipt({
    release: component,
    spec: { document: spec, bytes: bytes(spec) },
    tooling: { document: sdk, bytes: bytes(sdk) },
    execution: { mode: "native", platform: "darwin", architecture: "arm64" },
    tools: { node: "26.7.0", pnpm: "11.22.0" },
  });
  assert.equal(receipt.schema, "soksak-component-build-receipt-v1");
  assert.deepEqual(receipt.subject, { kind: "kit", id: "soksak-kit-example", version: "1.2.3" });
  assert.deepEqual(receipt.tooling, {
    kind: "kit", id: "soksak-sdk", version: "0.0.2",
    target: "any", file: sdk.artifacts[0].file, size: sdk.artifacts[0].size, sha256: sdk.artifacts[0].sha256,
  });
  assert.deepEqual(receipt.artifacts[0].execution, { mode: "native", platform: "darwin", architecture: "arm64" });
  assert.deepEqual(receipt.artifacts[0].tools, { node: "26.7.0", pnpm: "11.22.0" });
  assert.equal("execution" in receipt, false);
  assert.equal("tools" in receipt, false);
  assert.equal("sdk" in receipt, false);

  const root = temporary(); const out = join(root, "component-build-receipt.json");
  writeComponentBuildReceipt(out, receipt);
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), receipt);
  assert.throws(() => writeComponentBuildReceipt(out, receipt), /already exists/);
});
