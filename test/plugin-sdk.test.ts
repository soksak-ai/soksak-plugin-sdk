import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PluginManifest } from "@soksak/soksak-spec";
import {
  defineSoksakPlugin,
  derivePluginCommandInventory,
  pluginModuleInventory,
  selectSoksakPluginProvider,
  type PluginCommandOutcome,
  type SoksakPluginModule,
} from "../src/plugin.js";

describe("Plugin author SDK", () => {
  it("derives executable providers without executable icon exports", async () => {
    const outcome: PluginCommandOutcome = { ok: true, code: "OK", message: "refreshed", data: { count: 1 } };
    const module = defineSoksakPlugin({
      controller: { activate() {} },
      commands: { refresh: async () => outcome },
      views: { main: { mount({ root }) { root.textContent = "main"; } } },
      fileViewers: { code: { mount({ root, context }) { root.textContent = String(context.instance); } } },
      overlays: { mascot: { mount({ root }) { root.textContent = "●"; } } },
    } satisfies SoksakPluginModule);
    expect(await module.commands?.refresh({}, {} as never)).toEqual(outcome);
    expect(pluginModuleInventory(module)).toEqual({ commands: ["refresh"], views: ["main"], fileViewers: ["code"], overlays: ["mascot"] });
    expect(selectSoksakPluginProvider(module, { role: "preview", previewKind: "view", contributionId: "main" })).toBe(module.views?.main);
  });

  it("derives runtime and service commands from the Spec manifest type", () => {
    const commands: PluginManifest["contributes"]["commands"] = [
      { name: "refresh", title: "Refresh" },
      { name: "serve", title: "Serve", bind: "service", description: "Serve", params: {}, returns: "object" },
    ];
    expect(derivePluginCommandInventory({ commands })).toEqual({ runtime: ["refresh"], service: ["serve"] });
  });

  it("exposes only the public broker and provider surface", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/plugin.ts"), "utf8");
    for (const forbidden of ["app.call", "registerView", "commands.register", "interface PluginContext", "interface SoksakPluginApi"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
