import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("keeps a token text size next to a token text color", () => {
    expect(cn("text-h1", "text-text")).toBe("text-h1 text-text");
  });

  it("lets a later token text size win", () => {
    expect(cn("text-small", "text-body")).toBe("text-body");
  });
});
