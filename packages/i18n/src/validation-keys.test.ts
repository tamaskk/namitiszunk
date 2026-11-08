import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import hu from "../messages/hu.json";

// The API sends these keys in `error.fields` (apps/api/lib/handler.ts); each must exist in both languages.
const validatorsDir = join(import.meta.dirname, "../../validators/src");
const usedKeys = [
  ...new Set(
    readdirSync(validatorsDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .flatMap((file) =>
        [
          ...readFileSync(join(validatorsDir, file), "utf8").matchAll(
            /"(validation\.[\w.]+)"/g,
          ),
        ].map((m) => m[1]!),
      ),
  ),
];

const lookup = (messages: unknown, key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );

describe("validation message keys", () => {
  it("finds the keys the validators use", () => {
    expect(usedKeys.length).toBeGreaterThan(20);
  });

  it.each(["validation.invalid", ...usedKeys])(
    "%s exists in hu and en",
    (key) => {
      expect(typeof lookup(hu, key)).toBe("string");
      expect(typeof lookup(en, key)).toBe("string");
    },
  );
});
