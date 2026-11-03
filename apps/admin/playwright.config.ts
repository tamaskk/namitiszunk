import { defineConfig, devices } from "@playwright/test";

// Port 3102 keeps the e2e server clear of a `pnpm dev` already running on 3002.
const port = 3102;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The showcase needs no secrets; production builds still refuse the skip (packages/config/src/env.ts).
    command: `SKIP_ENV_VALIDATION=1 pnpm exec next dev --port ${port}`,
    url: `http://localhost:${port}/dev/ui`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
