import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const cli = join(root, "bin/soksak-sdk");
const specRoot = join(root, ".dependencies/soksak-spec");
const sdkVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const specVersion = JSON.parse(readFileSync(join(root, "sdk-spec.lock.json"), "utf8")).reference.version;
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const integrity = (file, letter) => ({ file, size: 12, sha256: letter.repeat(64) });

function release(kind, id, version, commit = "a".repeat(40)) {
  return {
    kind, id, version, manifest: integrity(`${kind}.json`, "b"),
    source: { repository: `https://github.com/soksak-ai/${id}`, commit },
    artifacts: [{ target: "any", file: `${id}-${version}-any.tgz`, size: 34, sha256: "c".repeat(64), format: "tgz", manifest: `${kind}.json` }],
    evidence: [integrity("conformance-release.json", "d")],
  };
}

test("attest binds a release to exact Spec, SDK, execution, and tool evidence idempotently", (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-attest-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const releaseDir = join(temporary, "release");
  mkdirSync(releaseDir);
  write(join(releaseDir, "release.json"), release("contract", "soksak-contract-example", "1.2.3"));
  const tooling = join(temporary, "soksak-sdk-release.json"); write(tooling, release("kit", "soksak-sdk", sdkVersion));
  const platform = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
  const architecture = process.arch === "arm64" ? "arm64" : "x64";
  const args = [
    "attest", "--release-dir", releaseDir, "--spec-root", specRoot, "--tooling-release", tooling,
    "--mode", "native", "--platform", platform, "--architecture", architecture,
    "--tool", "node=26.7.0", "--tool", "pnpm=11.22.0",
  ];
  const first = run(args); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).state, "created");
  const second = run(args); assert.equal(second.status, 0, second.stderr); assert.equal(JSON.parse(second.stdout).state, "unchanged");
  const receipt = JSON.parse(readFileSync(join(releaseDir, "component-build-receipt.json"), "utf8"));
  const attached = JSON.parse(readFileSync(join(releaseDir, "release.json"), "utf8"));
  assert.equal(receipt.spec.version, specVersion); assert.equal(receipt.tooling.version, sdkVersion);
  assert.equal(attached.evidence.some(({ file }) => file === "component-build-receipt.json"), true);
  writeFileSync(join(releaseDir, "component-build-receipt.json"), "{}\n");
  const tampered = run(args); assert.notEqual(tampered.status, 0); assert.match(tampered.stderr, /receipt.*differs/i);
});
