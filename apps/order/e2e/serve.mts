// Playwright's web server: seeds the Demo Klub into an in-memory replica set (pnpm db:seed:e2e),
// then serves the order app against it. Ctrl+C or Playwright's shutdown stops both.
// `node e2e/serve.mts <port> start` serves the production build instead (Lighthouse CI, T-049).
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Same path as e2eUriFile() in db.ts; Node runs this file without a TS resolver.
const e2eUriFile = (port: string) =>
  join(tmpdir(), `namitiszunk-order-e2e-${port}.uri`);

const port = process.argv[2] ?? "3101";
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
  // Tests that change stock (sold out in the cart) read the database from here.
  writeFileSync(e2eUriFile(port), uri);
  const next = spawn("pnpm", ["exec", "next", mode, "--port", port], {
    stdio: "inherit",
    env: { ...process.env, MONGODB_URI: uri, SKIP_ENV_VALIDATION: "1" },
  });
  children.push(next);
  next.on("exit", stop);
}
