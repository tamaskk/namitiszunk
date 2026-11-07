import { VenueMember } from "@namitiszunk/db";
import { sendEmail } from "@namitiszunk/emails";
import { Types } from "mongoose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestActor } from "./actors";
import { createAuth, type Auth } from "./better-auth";
import { acceptStaffInvite, createStaffInvite } from "./invites";
import { testSecret, useTestDb } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@namitiszunk/emails", () => ({ sendEmail: vi.fn() }));
process.env.BETTER_AUTH_SECRET = testSecret;
process.env.BETTER_AUTH_URL = "http://localhost:3002";

const db = useTestDb();
let auth: Auth;
beforeAll(() => {
  auth = createAuth("admin", db().connection.db!);
});

const t0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const day = 24 * 60 * 60 * 1000;
const venueId = new Types.ObjectId().toString();
const owner: RequestActor = {
  kind: "user",
  id: "user:o",
  userId: new Types.ObjectId().toString(),
  memberships: [{ venueId, memberId: "o", role: "owner" }],
};
const invitee = {
  userId: new Types.ObjectId().toString(),
  email: "Mari@Example.com",
  emailVerified: true,
  name: "Mari",
};

async function invite(role: "manager" | "owner" = "manager", actor = owner) {
  vi.mocked(sendEmail).mockClear();
  await createStaffInvite(
    auth,
    actor,
    {
      venueId,
      venueName: "Klub",
      email: "mari@example.com",
      role,
      locale: "hu",
    },
    t0,
  );
  const { url } = vi.mocked(sendEmail).mock.calls[0]![2] as { url: string };
  return new URL(url).searchParams.get("token")!;
}

beforeEach(async () => {
  await VenueMember.deleteMany({});
});

describe("staff invites", () => {
  it("e-mails a link and stores only the token's hash", async () => {
    const token = await invite();

    const stored = await db()
      .connection.db!.collection("verification")
      .findOne({ value: /mari@example.com/ });

    expect(sendEmail).toHaveBeenCalledWith(
      "staffInvite",
      "mari@example.com",
      expect.objectContaining({ role: "manager", venueName: "Klub" }),
    );
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("creates the membership once; a second use fails", async () => {
    const token = await invite();

    const first = await acceptStaffInvite(auth, invitee, token, t0 + day);
    const second = acceptStaffInvite(auth, invitee, token, t0 + day);

    expect(first).toEqual({ venueId, role: "manager" });
    await expect(second).rejects.toMatchObject({
      status: 404,
      code: "invite_invalid",
    });
    expect(
      await VenueMember.countDocuments({ venueId, userId: invitee.userId }),
    ).toBe(1);
  });

  it("expires after 7 days", async () => {
    const token = await invite();

    const late = acceptStaffInvite(auth, invitee, token, t0 + 7 * day + 1);

    await expect(late).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("refuses another account than the invited address", async () => {
    const token = await invite();
    const stranger = { ...invitee, email: "other@example.com" };

    const result = acceptStaffInvite(auth, stranger, token, t0);

    await expect(result).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("links only to the fixed Admin accept page", async () => {
    const token = await invite();

    const { url } = vi.mocked(sendEmail).mock.calls[0]![2] as { url: string };

    expect(url).toBe(`https://admin.namitiszunk.hu/invite?token=${token}`);
  });

  it("refuses an account whose e-mail address is not verified", async () => {
    const token = await invite();
    const unverified = { ...invitee, emailVerified: false };

    const result = acceptStaffInvite(auth, unverified, token, t0);

    await expect(result).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("refuses an unknown token", async () => {
    const result = acceptStaffInvite(auth, invitee, "a".repeat(43), t0);

    await expect(result).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("does not let a manager invite a manager", async () => {
    const manager: RequestActor = {
      ...owner,
      kind: "user",
      memberships: [{ venueId, memberId: "m", role: "manager" }],
    };

    const result = invite("manager", manager);

    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
