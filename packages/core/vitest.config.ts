import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first run downloads a mongod binary for MongoMemoryReplSet.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
