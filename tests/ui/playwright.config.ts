import path from "node:path";
import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
const realAPI = process.env.BEIVYMATE_REAL_API === "1";
const root = path.resolve(__dirname, "../..");
const python = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  testMatch: realAPI ? "portal.spec.ts" : "prototype.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: realAPI ? "off" : "retain-on-failure",
  },
  webServer: [
    ...(realAPI
      ? [
          {
            command: `"${python}" tests/ui/start_portal.py`,
            cwd: root,
            env: { PYTHONPATH: path.join(root, "src") },
            url: "http://127.0.0.1:8001/api/v1/session",
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: "npm run dev -- --port 4173 --strictPort",
      cwd: path.resolve(__dirname, "../../src/frontend"),
      url: "http://127.0.0.1:4173",
      env: realAPI ? { BEIVYMATE_API_TARGET: "http://127.0.0.1:8001" } : {},
      reuseExistingServer: realAPI ? false : !process.env.CI,
    },
  ],
});
