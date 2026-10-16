import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: ["auth-ui.spec.ts", "agent-app.spec.ts"],
  outputDir: "./test-results/auth-ui",
  use: { ...base.use, timezoneId: "Asia/Shanghai" },
});
