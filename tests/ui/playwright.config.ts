import path from "node:path";
import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    cwd: path.resolve(__dirname, "../../src/frontend"),
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
