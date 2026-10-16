import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: "workflow-demo.spec.ts",
  outputDir: "./test-results/workflow-demo",
});
