import { defineConfig, devices } from "@playwright/test";

// T-049 JS budget: the production build (`next build` first), not the dev server's unminified bundles.
const port = 3102;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.perf.ts",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["iPhone 13"],
    viewport: { width: 375, height: 812 },
    browserName: "chromium",
  },
  webServer: {
    command: `node e2e/serve.mts ${port} start`,
    url: `http://localhost:${port}/hu/v/demo`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
