import { defineConfig, devices } from "@playwright/test";

// Port 3103 keeps the e2e server clear of a `pnpm dev` already running on 3003.
const port = 3103;

export default defineConfig({
  // One dev server and one database shared by every spec; the 2FA specs build on each other.
  workers: 1,
  // The dev server compiles a route on its first visit, which can outlast the 5 s default.
  expect: { timeout: 15_000 },
  testDir: "./e2e",
  // Compiles the dev server's routes before the first test (CI flakes on first-request compiles).
  globalSetup: "./e2e/warm-up.ts",
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
