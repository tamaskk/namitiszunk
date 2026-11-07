import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // The first run downloads a mongod binary for MongoMemoryReplSet.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
