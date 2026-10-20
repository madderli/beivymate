import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
export default defineConfig({
  ...base,
  testMatch: [
    "workspace-production.spec.ts",
    "workspace-design.spec.ts",
    "workspace-experience.spec.ts",
  ],
  outputDir: "./test-results/workspace-ui",
});
