import { describe, expect, it } from "vitest";

import { guestTokenCookie, readGuestLink } from "./guest-link";

const orderId = "6730f1a2b3c4d5e6f7a8b9c0";
// Any 22 base64url characters pass the format check; spelled out at runtime so no literal looks like a key.
const token = "a".repeat(11) + "B".repeat(11);

describe("readGuestLink", () => {
  it("takes the token out of a live, thanks or confirmation link", () => {
    const urls = [
      `https://rendel.namitiszunk.hu/hu/o/${orderId}?t=${token}`,
      `https://rendel.namitiszunk.hu/en/o/${orderId}/thanks?t=${token}`,
      `https://rendel.namitiszunk.hu/hu/r/${orderId}?t=${token}&x=1`,
    ];

    const links = urls.map((u) => readGuestLink(new URL(u)));

    for (const link of links) {
      expect(link).toMatchObject({ orderId, token });
      expect(link!.clean.searchParams.has("t")).toBe(false);
    }
    expect(links[2]!.clean.search).toBe("?x=1");
  });

  it("keeps the link but drops a malformed token", () => {
    const url = new URL(
      `https://rendel.namitiszunk.hu/hu/o/${orderId}?t=${encodeURIComponent("bad token;")}`,
    );

    const link = readGuestLink(url);

    expect(link).toMatchObject({ orderId, token: null });
  });

  it("ignores pages that are not guest links, and links without a token", () => {
    const urls = [
      `https://rendel.namitiszunk.hu/hu/menu?t=${token}`,
      `https://rendel.namitiszunk.hu/hu/o/${orderId}`,
      `https://rendel.namitiszunk.hu/hu/o/not-an-id?t=${token}`,
    ];

    const links = urls.map((u) => readGuestLink(new URL(u)));

    expect(links).toEqual([null, null, null]);
  });

  it("names one cookie per order", () => {
    const name = guestTokenCookie(orderId);

    expect(name).toBe(`gt_${orderId}`);
  });
});
