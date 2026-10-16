import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "agent-demo.spec.ts",
  outputDir: "./test-results/agent-demo",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev --prefix src/frontend -- --port 5173 --strictPort",
    cwd: "../..",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
