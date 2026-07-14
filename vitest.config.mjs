import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/plugin-api/test/**/*.test.ts"],
  },
});
