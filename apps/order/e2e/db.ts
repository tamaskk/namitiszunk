// The in-memory e2e database, for tests that play the Admin (an item sold out mid-order).
// apps never import packages/db (ARCHITECTURE §05), so the update runs as a script inside it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const e2eUriFile = (port: string | number) =>
  join(tmpdir(), `namitiszunk-order-e2e-${port}.uri`);

// Playwright loads this file as CommonJS (no import.meta); it always runs from apps/order.
const dbPackage = resolve("../../packages/db");

/** Sets an item's isAvailable, as the Admin's sold-out switch would (T-054). */
export function setItemAvailable(
  port: number,
  itemId: string,
  available: boolean,
) {
  const script = `
    import { MongoClient, ObjectId } from "mongodb";
    const client = await MongoClient.connect(process.env.E2E_URI);
    await client.db().collection("items").updateOne(
      { _id: new ObjectId(process.env.ITEM_ID) },
      { $set: { isAvailable: process.env.AVAILABLE === "1" } },
    );
    await client.close();`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: dbPackage,
    env: {
      ...process.env,
      E2E_URI: readFileSync(e2eUriFile(port), "utf8"),
      ITEM_ID: itemId,
      AVAILABLE: available ? "1" : "0",
    },
  });
}
