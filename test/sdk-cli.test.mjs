import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { spawnSync } from "node:child_process";

const cli = join(import.meta.dirname, "../bin/soksak-sdk.mjs");
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const temporary = () => { const root = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-cli-")); roots.push(root); return root; };
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

function release(kind, id, version) {
  const target = kind === "sidecar" ? "aarch64-apple-darwin" : "any";
  return {
    kind, id, version, source: { repository: `https://github.com/soksak-ai/${id}`, commit: "a".repeat(40) },
    manifest: { file: `${kind}.json`, size: 12, sha256: "b".repeat(64) },
    artifacts: [{ target, file: `${id}-${version}-${target}.${kind === "sidecar" ? "tar.gz" : "tgz"}`, size: 34, sha256: "c".repeat(64), format: kind === "sidecar" ? "tar.gz" : "tgz", manifest: `${kind}.json` }],
    evidence: [{ file: "conformance-release.json", size: 56, sha256: "d".repeat(64) }],
  };
}

function json(root, name, value) { const path = join(root, name); writeFileSync(path, `${JSON.stringify(value)}\n`); return path; }

test("CLI inspects a folder workspace and creates one deterministic receipt", () => {
  const root = temporary(); const source = join(root, "source"); mkdirSync(source);
  json(source, "kit.json", { id: "soksak-kit-example", version: "1.2.3" });
  json(source, "package.json", { name: "@soksak/soksak-kit-example", version: "1.2.3" });
  const inspected = run(["inspect", "--root", source]);
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).id, "soksak-kit-example");

  const releasePath = json(root, "release.json", release("kit", "soksak-kit-example", "1.2.3"));
  const specPath = json(root, "spec-release.json", release("spec", "soksak-spec", "0.0.36"));
  const sdkPath = json(root, "sdk-release.json", release("kit", "soksak-sdk", "0.0.2"));
  const out = join(root, "component-build-receipt.json");
  const created = run([
    "receipt", "--release", releasePath, "--spec", specPath, "--tooling", sdkPath,
    "--mode", "native", "--platform", "darwin", "--architecture", "arm64",
    "--tool", "node=26.7.0", "--tool", "pnpm=11.22.0", "--out", out,
  ]);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).receipt, out);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).tooling.id, "soksak-sdk");
  assert.notEqual(run(["receipt", "--release", releasePath, "--spec", specPath, "--tooling", sdkPath, "--mode", "native", "--platform", "darwin", "--architecture", "arm64", "--tool", "node=26.7.0", "--out", out]).status, 0);
});

test("CLI delegates receipt judgment to an explicitly materialized Spec validator", () => {
  const root = temporary();
  const validator = join(root, "validate.mjs");
  writeFileSync(validator, "#!/usr/bin/env node\nprocess.exit(process.argv[2] === 'component-build-receipt' && process.argv[4] === '--release' ? 0 : 9);\n");
  chmodSync(validator, 0o755);
  const receipt = json(root, "receipt.json", {}); const releasePath = json(root, "release.json", {});
  const result = run(["verify", "--validator", validator, "--receipt", receipt, "--release", releasePath]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).verified, true);
  assert.equal(run(["verify", "--validator", validator, "--receipt", receipt, "--release", releasePath, "--skip", "true"]).status, 2);
});
