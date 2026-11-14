import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import type { Actor, PlatformRole } from "../auth/permissions";
import {
  canOpenHqModule,
  hqModules,
  isPlatformActor,
  requireHqModule,
} from "./modules";

const platform = (platformRole: PlatformRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [],
  platformRole,
  twoFactorVerified: true,
});

const open = (actor: Actor) =>
  hqModules.filter((m) => canOpenHqModule(actor, m.key)).map((m) => m.key);

describe("HQ modules", () => {
  it("opens every module to a platform admin", () => {
    const admin = platform("admin");

    const keys = open(admin);

    expect(keys).toEqual(["venues", "orders", "leads", "finance", "audit"]);
  });

  it("opens only their own work to Support and Finance", () => {
    const support = platform("support");
    const finance = platform("finance");

    const supportKeys = open(support);
    const financeKeys = open(finance);

    expect(supportKeys).toEqual(["orders"]);
    expect(financeKeys).toEqual(["finance", "audit"]);
  });

  it("refuses a venue Owner every module with a 403", () => {
    const owner: Actor = {
      kind: "user",
      userId: new Types.ObjectId().toString(),
      memberships: [
        {
          venueId: new Types.ObjectId().toString(),
          memberId: new Types.ObjectId().toString(),
          role: "owner",
        },
      ],
    };

    const keys = open(owner);

    expect(isPlatformActor(owner)).toBe(false);
    expect(keys).toEqual([]);
    expect(() => requireHqModule(owner, "venues")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});
