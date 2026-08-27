import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sdkRoot = join(import.meta.dirname, "..");
const cli = join(sdkRoot, "bin/soksak-sdk.mjs");
const specRoot = join(sdkRoot, ".dependencies/soksak-spec");
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

function git(source, args) {
  const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("Plugin tooling assembles one validated and idempotent release", (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-plugin-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = join(temporary, "soksak-plugin-example"); const out = join(temporary, "release");
  const scaffold = run(["scaffold", "--kind", "plugin", "--id", "soksak-plugin-example", "--version", "1.2.3", "--out", source]);
  assert.equal(scaffold.status, 0, scaffold.stderr);
  writeFileSync(join(source, "LICENSE"), "test license\n");
  writeFileSync(join(source, "main.js"), "export default {};\n");
  writeFileSync(join(source, "release-files.json"), '["LICENSE","main.js","plugin.json"]\n');
  for (const args of [
    ["init"], ["config", "user.email", "test@soksak.invalid"], ["config", "user.name", "soksak test"],
    ["add", "."], ["commit", "-m", "fixture"],
  ]) git(source, args);
  const commit = git(source, ["rev-parse", "HEAD"]);
  const args = ["package", "--root", source, "--spec-root", specRoot, "--commit", commit, "--out", out];
  const first = run(args); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).state, "created");
  const second = run(args); assert.equal(second.status, 0, second.stderr); assert.equal(JSON.parse(second.stdout).state, "unchanged");
  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  assert.deepEqual({ kind: release.kind, id: release.id, version: release.version }, { kind: "plugin", id: "soksak-plugin-example", version: "1.2.3" });
  assert.equal(release.artifacts[0].file, "soksak-plugin-example-1.2.3-any.tgz");
});
