// Starts an in-memory MongoDB on a fixed port, then the order app against it (see env.ts).
import { spawn } from "node:child_process";

import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create({ instance: { port: 27117 } });

const next = spawn("pnpm", ["exec", "next", "dev", "--port", "3101"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MONGODB_URI: mongo.getUri("namitiszunk_e2e"),
    NEXT_PUBLIC_API_URL: "http://localhost:3999",
    // No secrets in e2e; production builds still refuse the skip (packages/config/src/env.ts).
    SKIP_ENV_VALIDATION: "1",
  },
});

async function stop(code = 0) {
  next.kill();
  await mongo.stop();
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
next.on("exit", (code) => void stop(code ?? 0));
