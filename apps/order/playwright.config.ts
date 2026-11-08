import { defineConfig, devices } from "@playwright/test";

import { E2E_PORT } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  // Guest screens are phone screens (375px wide).
  projects: [
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    // An in-memory MongoDB plus `next dev`; the tests seed the same database.
    command: "node e2e/start-server.mjs",
    url: `http://localhost:${E2E_PORT}/hu`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
