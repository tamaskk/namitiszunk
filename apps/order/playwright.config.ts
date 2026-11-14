import { defineConfig, devices } from "@playwright/test";

// Port 3101 keeps the e2e server clear of a `pnpm dev` already running on 3001.
const port = 3101;

export default defineConfig({
  // One dev server and one seeded venue shared by every spec, and specs change it (pause, payouts).
  workers: 1,
  // The dev server compiles a server action on its first call, which can outlast the 5 s default.
  expect: { timeout: 15_000 },
  testDir: "./e2e",
  // Compiles the dev server's routes before the first test (CI flakes on first-request compiles).
  globalSetup: "./e2e/warm-up.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  // Guest screens must work at 375px (DESIGN_SYSTEM §08).
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 812 },
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    // Seeds the Demo Klub into an in-memory database first; no secrets needed.
    command: `node e2e/serve.mts ${port}`,
    url: `http://localhost:${port}/hu/v/demo`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
