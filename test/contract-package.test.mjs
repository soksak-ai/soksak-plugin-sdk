import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sdkRoot = join(import.meta.dirname, "..");
const cli = join(sdkRoot, "bin/soksak-sdk");
const specRoot = join(sdkRoot, ".dependencies/soksak-spec");
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function git(source, args) {
  const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("Contract tooling packages one portable release without a runtime adapter", (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-contract-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = join(temporary, "soksak-contract-example"); const out = join(temporary, "release");
  mkdirSync(join(source, "dist"), { recursive: true });
  writeFileSync(join(source, "LICENSE"), "test license\n"); writeFileSync(join(source, "README.md"), "# contract\n");
  writeFileSync(join(source, "dist/index.js"), "export const contract = {};\n");
  json(join(source, "contract.json"), { id: "soksak-contract-example", version: "1.2.3" });
  json(join(source, "package.json"), {
    name: "@soksak/soksak-contract-example", version: "1.2.3", private: true, type: "module",
    repository: { type: "git", url: "git+https://github.com/soksak-ai/soksak-contract-example.git" },
    exports: { ".": "./dist/index.js" },
  });
  json(join(source, "release-files.json"), ["LICENSE", "README.md", "contract.json", "dist/index.js", "package.json"]);
  for (const args of [
    ["init"], ["config", "user.email", "test@soksak.invalid"], ["config", "user.name", "soksak test"],
    ["add", "."], ["commit", "-m", "fixture"],
  ]) git(source, args);
  const commit = git(source, ["rev-parse", "HEAD"]);
  const result = run(["package", "--root", source, "--spec-root", specRoot, "--commit", commit, "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  assert.deepEqual({ kind: release.kind, id: release.id, version: release.version }, { kind: "contract", id: "soksak-contract-example", version: "1.2.3" });
  assert.equal(release.artifacts[0].manifest, "contract.json");
});
