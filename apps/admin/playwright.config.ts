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
    // Seeds the Demo Klub into an in-memory database first; production builds still refuse the env skip.
    command: `node e2e/serve.mts ${port}`,
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
