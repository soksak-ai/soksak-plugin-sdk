import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const cli = join(root, "bin/soksak-sdk.mjs");
const validator = join(root, ".dependencies/soksak-spec/bin/validate.mjs");
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

test("scaffold creates each component kind without inventing a backend implementation", (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "soksak-sdk-scaffold-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const kind of ["plugin", "sidecar", "kit", "contract", "spec"]) {
    const id = `soksak-${kind}-example`; const out = join(temporary, kind);
    const result = run(["scaffold", "--kind", kind, "--id", id, "--version", "1.2.3", "--out", out]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(out, `${kind}.json`), "utf8")).id, id);
    assert.equal(existsSync(join(out, "Makefile")), true);
    assert.equal(existsSync(join(out, "README.md")), true);
    assert.equal(existsSync(join(out, "README.ko.md")), true);
    if (kind === "plugin") {
      assert.match(readFileSync(join(out, "src/main.ts"), "utf8"), /@soksak\/soksak-sdk\/plugin/);
      const validated = spawnSync(process.execPath, [validator, "plugin", out], { encoding: "utf8" });
      assert.equal(validated.status, 0, validated.stderr);
    } else {
      assert.equal(existsSync(join(out, "src")), false);
    }
    assert.notEqual(run(["scaffold", "--kind", kind, "--id", id, "--version", "1.2.3", "--out", out]).status, 0);
  }
});
