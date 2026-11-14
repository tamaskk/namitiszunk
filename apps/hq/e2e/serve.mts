// Playwright's web server: seeds the Demo Klub into an in-memory replica set (pnpm db:seed:e2e),
// then serves the hq app against it, with a fixed auth secret so tests can sign a session cookie. Ctrl+C or Playwright's shutdown stops both.
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Same path as e2eUriFile() in db.ts; Node runs this file without a TS resolver.
const e2eUriFile = (port: string) =>
  join(tmpdir(), `namitiszunk-hq-e2e-${port}.uri`);

// Same value as e2e/db.ts; a test-only secret for the in-memory database, never a real one.
const E2E_AUTH_SECRET = "e2e-only-hq-secret-0123456789abcdef";

const port = process.argv[2] ?? "3103";
const mode = process.argv[3] === "start" ? "start" : "dev";
const children: ChildProcess[] = [];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const seed = spawn("pnpm", ["--filter", "@namitiszunk/db", "seed:e2e"], {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, MONGODB_URI: "" },
});
children.push(seed);
seed.on("exit", (code) => {
  console.error(`seed:e2e exited with ${code}`);
  stop();
});

for await (const line of createInterface({ input: seed.stdout! })) {
  console.log(line);
  const uri = /in-memory MONGODB_URI=(\S+)/.exec(line)?.[1];
  if (!uri) continue;
  // Tests create sessions and read the pause state from here.
  writeFileSync(e2eUriFile(port), uri);
  const next = spawn("pnpm", ["exec", "next", mode, "--port", port], {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI: uri,
      SKIP_ENV_VALIDATION: "1",
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
  });
  children.push(next);
  next.on("exit", stop);
}
