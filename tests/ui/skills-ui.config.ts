import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
import base from "./skill-center.config";
process.env.BEIVYMATE_SKILLS_UI = "1";
export default defineConfig({
  ...base,
  testMatch: [
    "skill-center.spec.ts",
    "skills-ui.spec.ts",
    "workflow-ui.spec.ts",
  ],
  outputDir: "./test-results/skills-ui",
});
