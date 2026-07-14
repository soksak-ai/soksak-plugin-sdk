import type {
  PluginCommandHandler,
  SoksakPluginModule,
} from "@soksak-ai/plugin-api";

const JOB_ID = "reminder-demo:hourly";
const FIRE_COMMAND = "plugin.soksak-plugin-reminder-demo.fire";

const fire: PluginCommandHandler = async (params, context) => {
  const title = typeof params.title === "string" ? params.title : "soksak reminder";
  const body = typeof params.body === "string" ? params.body : "The hourly reminder fired.";
  return context.invocation.execute("notify.show", { title, body });
};

const plugin = {
  controller: {
    async activate({ app }) {
      const result = await app.commands.execute("schedule.register", {
        id: JOB_ID,
        trigger: { kind: "every", every_ms: 3_600_000 },
        command: FIRE_COMMAND,
        params: {
          title: "soksak reminder",
          body: "The hourly reminder fired.",
        },
      });
      if (!result.ok) throw new Error(`schedule.register failed: ${result.code}: ${result.message}`);
    },
    async deactivate({ app }) {
      const result = await app.commands.execute("schedule.cancel", { id: JOB_ID });
      if (!result.ok) throw new Error(`schedule.cancel failed: ${result.code}: ${result.message}`);
    },
  },
  commands: { fire },
} satisfies SoksakPluginModule;

export default plugin;
