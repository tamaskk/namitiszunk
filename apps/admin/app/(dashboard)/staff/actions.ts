"use server";

import { createStaffInvite, getAuth } from "@namitiszunk/auth";
import {
  addPinMember,
  changeMemberPin,
  revokeDevice,
  setMemberActive,
} from "@namitiszunk/core/staff";
import type { Locale } from "@namitiszunk/i18n";
import {
  addPinMemberInputSchema,
  changeMemberPinInputSchema,
  revokeDeviceInputSchema,
  setMemberActiveInputSchema,
  staffInviteInputSchema,
} from "@namitiszunk/validators";
import { getLocale } from "next-intl/server";

import { runMenuAction as run } from "../menu/run-menu-action";

// Staff (T-057): the actor and venue come from the session in `run`; core checks who may manage whom.

export async function addPinMemberAction(input: unknown) {
  return run(
    addPinMemberInputSchema,
    input,
    (data, c) => addPinMember(c.actor, c.venueId, data).then(() => null),
    "/staff",
  );
}

export async function changeMemberPinAction(input: unknown) {
  return run(
    changeMemberPinInputSchema,
    input,
    ({ memberId, pin }, c) =>
      changeMemberPin(c.actor, c.venueId, memberId, pin).then(() => null),
    "/staff",
  );
}

export async function setMemberActiveAction(input: unknown) {
  return run(
    setMemberActiveInputSchema,
    input,
    ({ memberId, active }, c) =>
      setMemberActive(c.actor, c.venueId, memberId, active).then(() => null),
    "/staff",
  );
}

export async function revokeDeviceAction(input: unknown) {
  return run(
    revokeDeviceInputSchema,
    input,
    ({ deviceId }, c) =>
      revokeDevice(c.actor, c.venueId, deviceId).then(() => null),
    "/staff",
  );
}

/** Only the Owner invites a Manager or Owner; `createStaffInvite` checks it (staff.invite). */
export async function inviteMemberAction(input: unknown) {
  return run(
    staffInviteInputSchema,
    input,
    async ({ email, role }, c) => {
      await createStaffInvite(await getAuth("admin"), c.actor, {
        venueId: c.venueId,
        // `run` already refused a context without a venue.
        venueName: c.venue?.name ?? "",
        email,
        role,
        locale: (await getLocale()) as Locale,
      });
      return null;
    },
    "/staff",
  );
}
