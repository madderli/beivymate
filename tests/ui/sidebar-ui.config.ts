import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: ["sidebar-ui.spec.ts", "agent-app.spec.ts"],
  outputDir: "./test-results/sidebar-ui",
});
