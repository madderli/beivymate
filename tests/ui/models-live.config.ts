import path from "node:path";
import { defineConfig } from "../../src/frontend/node_modules/@playwright/test";
const root = path.resolve(__dirname, "../..");
export default defineConfig({
  testDir: ".",
  testMatch: "models-live.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `"${root}/.venv/bin/python" tests/ui/start_models.py`,
      cwd: root,
      env: { PYTHONPATH: path.join(root, "src") },
      url: "http://127.0.0.1:8001/api/v1/session",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 4173 --strictPort",
      cwd: path.join(root, "src/frontend"),
      env: { BEIVYMATE_API_TARGET: "http://127.0.0.1:8001" },
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
  ],
});
