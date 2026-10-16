import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: ["task-home.spec.ts", "agent-app.spec.ts"],
  outputDir: "./test-results/task-home",
  use: { ...base.use, timezoneId: "Asia/Shanghai" },
});
