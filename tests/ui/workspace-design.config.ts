import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: "workspace-design.spec.ts",
  outputDir: "./test-results/workspace-design",
});
