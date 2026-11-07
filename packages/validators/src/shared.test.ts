import { describe, expect, it } from "vitest";

import { blobUrlSchema, nameSchema } from "./shared";

describe("nameSchema", () => {
  it("accepts a Hungarian name with spaces and punctuation", () => {
    expect(nameSchema.safeParse("Örvény Bár – Fő pult").success).toBe(true);
  });

  it.each(["Bar\r\nBcc: x@evil.example", "Bar\nName", "Bar\u0000", "Bar\t"])(
    "rejects control characters in %j",
    (name) => {
      expect(nameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe("blobUrlSchema", () => {
  it("accepts an https URL on the Vercel Blob public host", () => {
    const url = "https://abc123.public.blob.vercel-storage.com/logo.png";

    expect(blobUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "http://abc123.public.blob.vercel-storage.com/logo.png",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/logo.png",
    "https://localhost/logo.png",
    "https://evil.com/abc.public.blob.vercel-storage.com.png",
    "https://abc.public.blob.vercel-storage.com.evil.com/logo.png",
  ])("rejects %s", (url) => {
    expect(blobUrlSchema.safeParse(url).success).toBe(false);
  });
});
