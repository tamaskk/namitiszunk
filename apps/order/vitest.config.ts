import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // e2e/ belongs to Playwright.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
