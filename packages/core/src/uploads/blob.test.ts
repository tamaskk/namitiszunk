import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../auth/permissions";

vi.mock("server-only", () => ({}));
const del = vi.hoisted(() => vi.fn());
const generateClientTokenFromReadWriteToken = vi.hoisted(() =>
  vi.fn(async () => "client-token"),
);
vi.mock("@vercel/blob", () => ({ del }));
vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken,
}));

const { createUploadToken, deleteBlob, uploadTokenOptions } =
  await import("./blob");

const venueId = "a".repeat(24);
const otherVenueId = "b".repeat(24);
const uuid = "123e4567-e89b-42d3-a456-426614174000";
const host = "https://abc123.public.blob.vercel-storage.com";

const user = (role: "manager" | "owner" | "bartender", forVenue = venueId) =>
  ({
    kind: "user",
    userId: "u1",
    memberships: [{ venueId: forVenue, memberId: "m1", role }],
  }) satisfies Actor;

// Blob enforces the token's constraints on upload; this checks a file against them the same way.
function tokenAccepts(
  options: ReturnType<typeof uploadTokenOptions>,
  file: { type: string; size: number },
) {
  return (
    options.allowedContentTypes.includes(file.type) &&
    file.size <= options.maximumSizeInBytes
  );
}

beforeEach(() => {
  del.mockClear();
  generateClientTokenFromReadWriteToken.mockClear();
});

describe("createUploadToken", () => {
  it.each(["manager", "owner"] as const)(
    "issues a token to the venue's %s",
    async (role) => {
      const result = await createUploadToken(user(role), {
        venueId,
        kind: "product",
      });
      expect(result.clientToken).toBe("client-token");
      expect(result.pathname).toMatch(
        new RegExp(`^venues/${venueId}/product/[0-9a-f-]{36}$`),
      );
    },
  );

  it("refuses a bartender and another venue's manager", async () => {
    await expect(
      createUploadToken(user("bartender"), { venueId, kind: "product" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createUploadToken(user("manager", otherVenueId), {
        venueId,
        kind: "product",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled();
  });

  it("limits logo and cover uploads to the owner", async () => {
    await expect(
      createUploadToken(user("manager"), { venueId, kind: "venue" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createUploadToken(user("owner"), { venueId, kind: "venue" }),
    ).resolves.toBeDefined();
  });
});

describe("uploadTokenOptions", () => {
  const options = uploadTokenOptions(venueId, "product");

  it("accepts a JPEG, PNG or WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(tokenAccepts(options, { type, size: 5 * 1024 * 1024 })).toBe(true);
  });

  it("rejects a 6 MB image and a PDF", () => {
    expect(
      tokenAccepts(options, { type: "image/png", size: 6 * 1024 * 1024 }),
    ).toBe(false);
    expect(tokenAccepts(options, { type: "application/pdf", size: 1000 })).toBe(
      false,
    );
  });

  it("fixes a fresh server pathname with no suffix or overwrite", () => {
    expect(options).toMatchObject({
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    expect(uploadTokenOptions(venueId, "product").pathname).not.toBe(
      options.pathname,
    );
    expect(options.validUntil).toBeGreaterThan(Date.now());
  });
});

describe("deleteBlob", () => {
  it("deletes an image in the actor's venue folder", async () => {
    const url = `${host}/venues/${venueId}/product/${uuid}`;
    await deleteBlob(user("manager"), { venueId, kind: "product", url });
    expect(del).toHaveBeenCalledWith(url);
  });

  it.each([
    ["a foreign host", `https://evil.com/venues/${venueId}/product/${uuid}`],
    [
      "plain http",
      `http://abc123.public.blob.vercel-storage.com/venues/${venueId}/product/${uuid}`,
    ],
    [
      "a lookalike host",
      `https://abc.public.blob.vercel-storage.com.evil.com/venues/${venueId}/product/${uuid}`,
    ],
    [
      "another venue's folder",
      `${host}/venues/${otherVenueId}/product/${uuid}`,
    ],
    ["a path outside venues/", `${host}/other/${uuid}`],
    [
      "a traversal",
      `${host}/venues/${venueId}/product/../${otherVenueId}/product/${uuid}`,
    ],
    ["a nested path", `${host}/venues/${venueId}/product/x/${uuid}`],
    ["a path without the kind", `${host}/venues/${venueId}/${uuid}`],
    ["a query string", `${host}/venues/${venueId}/product/${uuid}?x=1`],
  ])("refuses %s", async (_name, url) => {
    await expect(
      deleteBlob(user("manager"), { venueId, kind: "product", url }),
    ).rejects.toMatchObject({ status: 400 });
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses a venue id that is not an ObjectId", async () => {
    await expect(
      deleteBlob(
        {
          kind: "user",
          userId: "u1",
          memberships: [{ venueId: ".*", memberId: "m", role: "owner" }],
        },
        { venueId: ".*", kind: "product", url: `${host}/venues/x/${uuid}` },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("never lets a manager delete the logo or cover, whatever kind is claimed", async () => {
    const url = `${host}/venues/${venueId}/venue/${uuid}`;

    const asProduct = deleteBlob(user("manager"), {
      venueId,
      kind: "product",
      url,
    });
    const asVenue = deleteBlob(user("manager"), {
      venueId,
      kind: "venue",
      url,
    });

    await expect(asProduct).rejects.toMatchObject({ status: 400 });
    await expect(asVenue).rejects.toMatchObject({ status: 403 });
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses a bartender before looking at the URL", async () => {
    await expect(
      deleteBlob(user("bartender"), {
        venueId,
        kind: "product",
        url: `${host}/venues/${venueId}/product/${uuid}`,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(del).not.toHaveBeenCalled();
  });
});
