import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const example = join(root, "packages/plugin-api/examples/soksak-plugin-reminder-demo");

test("the packaged reminder example is a validated standalone plugin", async () => {
  for (const path of ["README.md", "plugin.json", "src/main.ts", "dist/main.js", "tsconfig.json"]) {
    assert.equal(existsSync(join(example, path)), true, `reminder example file: ${path}`);
  }
  const validation = spawnSync(process.execPath, [
    join(root, ".dependencies/plugin-spec/bin/validate.mjs"),
    "plugin",
    join(example, "plugin.json"),
  ], { cwd: root, encoding: "utf8" });
  assert.equal(validation.status, 0, `${validation.stdout}${validation.stderr}`);
  assert.doesNotMatch(readFileSync(join(example, "dist/main.js"), "utf8"), /@soksak-ai\//);

  const plugin = (await import(`${pathToFileURL(join(example, "dist/main.js")).href}?test=${Date.now()}`)).default;
  assert.deepEqual(Object.keys(plugin.commands), ["fire"]);
  const calls = [];
  const execute = async (command, params) => {
    calls.push({ command, params });
    return command === "schedule.register"
      ? { ok: true, code: "OK", message: "registered", data: { jobId: params.id } }
      : { ok: true, code: "OK", message: "done" };
  };
  await plugin.controller.activate({ app: { commands: { execute } } });
  assert.deepEqual(calls[0], {
    command: "schedule.register",
    params: {
      id: "reminder-demo:hourly",
      trigger: { kind: "every", every_ms: 3_600_000 },
      command: "plugin.soksak-plugin-reminder-demo.fire",
      params: { title: "soksak reminder", body: "The hourly reminder fired." },
    },
  });

  const nested = [];
  const outcome = await plugin.commands.fire(
    { title: "Review", body: "Open the release checklist." },
    { invocation: { execute: async (command, params) => {
      nested.push({ command, params });
      return { ok: true, code: "OK", message: "shown" };
    } } },
  );
  assert.deepEqual(nested, [{
    command: "notify.show",
    params: { title: "Review", body: "Open the release checklist." },
  }]);
  assert.equal(outcome.ok, true);
});
