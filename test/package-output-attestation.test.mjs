import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { finalizePackageOutput } from "../dist/component-packaging.js";

const specRoot = join(import.meta.dirname, "../.dependencies/soksak-spec");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function base(root, name) {
  const directory = join(root, name);
  mkdirSync(directory);
  writeFileSync(join(directory, "component.tgz"), "same bytes\n");
  writeFileSync(join(directory, "release.json"), `${JSON.stringify({
    kind: "kit", id: "soksak-example", version: "0.0.1",
    artifacts: [{ file: "component.tgz" }], evidence: [],
  }, null, 2)}\n`);
  return directory;
}

test("packaging reuses an equal base after canonical attestation", (context) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "sdk-package-attested-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, "output");
  assert.equal(finalizePackageOutput(base(root, "first"), output, specRoot).state, "created");

  const receipt = Buffer.from("{\"schema\":\"soksak-component-build-receipt-v1\"}\n");
  writeFileSync(join(output, "component-build-receipt.json"), receipt);
  const releasePath = join(output, "release.json");
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  release.evidence.push({ file: "component-build-receipt.json", size: receipt.length, sha256: sha256(receipt) });
  writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);

  assert.equal(finalizePackageOutput(base(root, "second"), output, specRoot).state, "unchanged");
  assert.deepEqual(readFileSync(join(output, "component-build-receipt.json")), receipt);
});
