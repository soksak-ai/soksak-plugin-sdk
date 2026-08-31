import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("the SDK invokes its prepared Spec validator without an ambient-name lookup", () => {
  const collision = mkdtempSync(join(tmpdir(), "soksak-validate-collision-"));
  try {
    const ambient = join(collision, "soksak-validate");
    writeFileSync(ambient, "#!/bin/sh\nexit 97\n");
    chmodSync(ambient, 0o755);
    const fixture = join(
      root,
      ".dependencies/soksak-spec/test/fixtures/platform-wire/release-kit.json",
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "bin/soksak-sdk"), "validate", "release", fixture],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PATH: `${collision}:${process.env.PATH}` },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(collision, { recursive: true, force: true });
  }
});
