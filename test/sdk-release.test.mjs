import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const spec = join(root, ".dependencies/soksak-spec");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

test("the SDK packages as one canonical Kit release", (context) => {
  const out = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-release-"));
  context.after(() => rmSync(out, { recursive: true, force: true }));
  const commit = run("git", ["rev-parse", "HEAD"]);
  run(process.execPath, [join(spec, "release-template/build-portable-release.mjs"), "--commit", commit, "--out", out]);
  run(process.execPath, [join(spec, "bin/validate.mjs"), "release", join(out, "release.json")]);
  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  assert.deepEqual({ kind: release.kind, id: release.id, version: release.version }, { kind: "kit", id: "soksak-sdk", version: "0.0.7" });
  assert.equal(release.artifacts[0].target, "any");
  assert.equal(release.artifacts[0].manifest, "kit.json");
});
