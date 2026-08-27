import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const cli = join(root, "bin/soksak-sdk.mjs");
const specRoot = join(root, ".dependencies/soksak-spec");
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function git(source, args) {
  const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("Sidecar tooling packs one native target and assembles one idempotent matrix release", (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-sidecar-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = join(temporary, "soksak-sidecar-example"); const staged = join(temporary, "staged");
  const artifacts = join(temporary, "target-artifacts"); const out = join(temporary, "release");
  mkdirSync(join(source, "release"), { recursive: true }); mkdirSync(join(staged, "dist"), { recursive: true }); mkdirSync(artifacts);
  const manifest = {
    id: "soksak-sidecar-example", version: "1.2.3",
    interface: { id: "soksak-spec-sidecar-example", version: "0.0.2" },
    process: "dist/soksak-sidecar-example",
  };
  json(join(source, "sidecar.json"), manifest);
  json(join(source, "release/targets.json"), [
    { target: "aarch64-apple-darwin", runner: "macos-15" },
    { target: "x86_64-unknown-linux-gnu", runner: "ubuntu-24.04" },
  ]);
  writeFileSync(join(source, "Cargo.toml"), '[package]\nname = "soksak-sidecar-example"\nversion = "1.2.3"\npublish = false\n');
  json(join(staged, "sidecar.json"), manifest);
  const binary = Buffer.alloc(32); binary.writeUInt32LE(0xfeedfacf, 0); binary.writeUInt32LE(0x0100000c, 4);
  writeFileSync(join(staged, manifest.process), binary);
  for (const args of [
    ["init"], ["config", "user.email", "test@soksak.invalid"], ["config", "user.name", "soksak test"],
    ["add", "."], ["commit", "-m", "fixture"],
  ]) git(source, args);
  const commit = git(source, ["rev-parse", "HEAD"]);
  const archive = join(artifacts, "soksak-sidecar-example-1.2.3-aarch64-apple-darwin.tar.gz");
  const targetArgs = ["pack-target", "--root", source, "--spec-root", specRoot, "--target", "aarch64-apple-darwin", "--source", staged, "--out", archive];
  const firstTarget = run(targetArgs); assert.equal(firstTarget.status, 0, firstTarget.stderr);
  const secondTarget = run(targetArgs); assert.equal(secondTarget.status, 0, secondTarget.stderr);
  assert.equal(JSON.parse(firstTarget.stdout).sha256, JSON.parse(secondTarget.stdout).sha256);

  const releaseArgs = [
    "package", "--root", source, "--spec-root", specRoot, "--commit", commit,
    "--artifacts", artifacts, "--target", "aarch64-apple-darwin", "--out", out,
  ];
  const first = run(releaseArgs); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).state, "created");
  const second = run(releaseArgs); assert.equal(second.status, 0, second.stderr); assert.equal(JSON.parse(second.stdout).state, "unchanged");
  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  assert.deepEqual({ kind: release.kind, id: release.id, version: release.version }, { kind: "sidecar", id: manifest.id, version: manifest.version });
  assert.equal(JSON.parse(readFileSync(join(out, "conformance-interface.json"), "utf8")).claim.contract.version, "0.0.2");
  assert.equal(existsSync(join(out, release.artifacts[0].file)), true);
  assert.equal(existsSync(join(out, `${release.artifacts[0].file}.sha256`)), false);
});
