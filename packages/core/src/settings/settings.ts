import "server-only";

import { DEFAULT_TIP_PRESETS_BPS, Venue } from "@namitiszunk/db";
import type {
  OpeningHourInput,
  SettingsTab,
  VenueSettingsInput,
} from "@namitiszunk/validators";

import { audit, auditActorOf } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import { DEFAULT_MAX_ITEMS_PER_ORDER } from "../cart/selection";
import { AppError, NotFoundError, reportError } from "../errors";
import { bumpMenuVersion, inTransaction } from "../menu/admin-menu";
import { deleteBlob, isVenueBlobUrl } from "../uploads/blob";
import { accentIsReadable } from "./contrast";

/** Every Settings tab's current values, as the forms show them ("" for an unset text). */
export type VenueSettings = {
  slug: string;
  basics: {
    name: string;
    address: { street: string; city: string; postalCode: string };
    company: { name: string; taxNumber: string };
    contactEmail: string;
  };
  hours: { businessDayStart: string; openingHours: OpeningHourInput[] };
  branding: {
    logoUrl: string;
    coverUrl: string;
    accentColor: string;
    /** false: the guest pages use the default accent instead (T-058, 4.5:1). */
    accentReadable: boolean;
  };
  order: {
    autoAccept: boolean;
    pickupDeadlineMinutes: number;
    refundOnExpiry: boolean;
    maxItemsPerOrder: number;
    minimumOrderHuf: number;
    lastOrderMinutesBeforeClose: number;
    serviceFee: { type: "none" | "percent" | "fixed"; value: number };
    tips: { enabled: boolean; presetsBps: number[] };
  };
  notifications: { smsEnabled: boolean };
};

type VenueDoc = NonNullable<Awaited<ReturnType<typeof loadVenue>>>;

const loadVenue = (venueId: string) =>
  Venue.findById(venueId)
    .select(
      "slug name address company contactEmail businessDayStart openingHours branding orderRules",
    )
    .lean();

function toSettings(venue: VenueDoc): VenueSettings {
  const rules = venue.orderRules;
  const accentColor = venue.branding?.accentColor ?? "";
  return {
    slug: venue.slug,
    basics: {
      name: venue.name,
      address: {
        street: venue.address?.street ?? "",
        city: venue.address?.city ?? "",
        postalCode: venue.address?.postalCode ?? "",
      },
      company: {
        name: venue.company?.name ?? "",
        taxNumber: venue.company?.taxNumber ?? "",
      },
      contactEmail: venue.contactEmail ?? "",
    },
    hours: {
      businessDayStart: venue.businessDayStart ?? "06:00",
      openingHours: (venue.openingHours ?? []).map(({ day, open, close }) => ({
        day,
        open,
        close,
      })),
    },
    branding: {
      logoUrl: venue.branding?.logoUrl ?? "",
      coverUrl: venue.branding?.coverUrl ?? "",
      accentColor,
      accentReadable: accentColor === "" || accentIsReadable(accentColor),
    },
    order: {
      autoAccept: rules?.autoAccept ?? true,
      pickupDeadlineMinutes: rules?.pickupDeadlineMinutes ?? 30,
      refundOnExpiry: rules?.refundOnExpiry ?? false,
      maxItemsPerOrder: rules?.maxItemsPerOrder ?? DEFAULT_MAX_ITEMS_PER_ORDER,
      minimumOrderHuf: rules?.minimumOrderHuf ?? 0,
      lastOrderMinutesBeforeClose: rules?.lastOrderMinutesBeforeClose ?? 15,
      serviceFee: {
        type: rules?.serviceFee?.type ?? "none",
        value: rules?.serviceFee?.value ?? 0,
      },
      tips: {
        enabled: rules?.tips?.enabled ?? true,
        presetsBps: rules?.tips?.presetsBps?.length
          ? [...rules.tips.presetsBps]
          : [...DEFAULT_TIP_PRESETS_BPS],
      },
    },
    notifications: { smsEnabled: rules?.smsEnabled ?? false },
  };
}

/** The Settings page (T-058): Owner and platform admin only (`venue.editSettings`). */
export async function getVenueSettings(
  actor: Actor,
  venueId: string,
): Promise<VenueSettings> {
  requirePermission(actor, "venue.editSettings", { venueId });
  const venue = await loadVenue(venueId);
  if (!venue) throw new NotFoundError();
  return toSettings(venue);
}

// An empty field clears the stored value instead of saving "".
const orUnset = (value: string) => (value === "" ? undefined : value);

/** The database update for one tab; `$unset` for cleared fields. */
function updateFor(input: VenueSettingsInput): {
  $set: Record<string, unknown>;
  $unset: Record<string, 1>;
} {
  const set: Record<string, unknown> = {};
  const fields: Record<string, unknown> = {};
  switch (input.tab) {
    case "basics":
      set.name = input.name;
      Object.assign(fields, {
        "address.street": orUnset(input.address.street),
        "address.city": orUnset(input.address.city),
        "address.postalCode": orUnset(input.address.postalCode),
        "company.name": orUnset(input.company.name),
        "company.taxNumber": orUnset(input.company.taxNumber),
        contactEmail: orUnset(input.contactEmail),
      });
      break;
    case "hours":
      set.businessDayStart = input.businessDayStart;
      // No hours: the bars' open/closed switch alone decides (T-048).
      fields.openingHours = input.openingHours.length
        ? [...input.openingHours].sort((a, b) => a.day - b.day)
        : undefined;
      break;
    case "branding":
      Object.assign(fields, {
        "branding.logoUrl": orUnset(input.logoUrl),
        "branding.coverUrl": orUnset(input.coverUrl),
        "branding.accentColor": orUnset(input.accentColor),
      });
      break;
    case "order":
      for (const key of [
        "autoAccept",
        "pickupDeadlineMinutes",
        "refundOnExpiry",
        "maxItemsPerOrder",
        "minimumOrderHuf",
        "lastOrderMinutesBeforeClose",
      ] as const)
        set[`orderRules.${key}`] = input[key];
      // Shown as buttons left to right: smallest first.
      set["orderRules.tips"] = {
        enabled: input.tips.enabled,
        presetsBps: [...input.tips.presetsBps].sort((a, b) => a - b),
      };
      // "None" stores no amount, so switching back to % or fixed starts from 0.
      set["orderRules.serviceFee"] =
        input.serviceFee.type === "none"
          ? { type: "none", value: 0 }
          : input.serviceFee;
      break;
    case "notifications":
      set["orderRules.smsEnabled"] = input.smsEnabled;
      break;
  }
  const $unset: Record<string, 1> = {};
  for (const [path, value] of Object.entries(fields)) {
    if (value === undefined) $unset[path] = 1;
    else set[path] = value;
  }
  return { $set: set, $unset };
}

/**
 * Saves one Settings tab with an audit entry (before and after of that tab) and a new menu
 * version, so the order app's cached menu, colour and tips change on the next page load.
 */
export async function updateVenueSettings(
  actor: Actor,
  venueId: string,
  input: VenueSettingsInput,
): Promise<VenueSettings> {
  requirePermission(actor, "venue.editSettings", { venueId });
  const tab: SettingsTab = input.tab;
  const { $set, $unset } = updateFor(input);
  const saved = await inTransaction(async (session) => {
    const before = await Venue.findById(venueId)
      .select(
        "slug name address company contactEmail businessDayStart openingHours branding orderRules",
      )
      .session(session)
      .lean();
    if (!before) throw new NotFoundError();
    if (input.tab === "branding") assertOwnImages(venueId, input, before);
    const after = await Venue.findByIdAndUpdate(
      venueId,
      { $set, ...(Object.keys($unset).length && { $unset }) },
      // Update validators check the model's ranges and patterns; the 100% fee cap (capPercent, a
      // document hook) does not run on an update, so serviceFeeSchema in validators is that guard.
      { session, new: true, runValidators: true },
    )
      .select(
        "slug name address company contactEmail businessDayStart openingHours branding orderRules",
      )
      .lean();
    if (!after) throw new NotFoundError();
    await bumpMenuVersion(venueId, session);
    const result = { before: toSettings(before), after: toSettings(after) };
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "venue.settingsUpdated",
      target: { type: "venue", id: venueId },
      before: { [tab]: result.before[tab] },
      // The contact e-mail is stripped from the log as personal data; that it changed is not.
      after: {
        [tab]: result.after[tab],
        ...(result.before.basics.contactEmail !==
          result.after.basics.contactEmail && { changed: ["contactEmail"] }),
      },
    });
    return result;
  });
  if (tab === "branding") await deleteReplacedImages(actor, venueId, saved);
  return saved.after;
}

/** A new logo or cover must be one we issued for this venue (SECURITY.md uploads); an unchanged one stays. */
function assertOwnImages(
  venueId: string,
  input: Extract<VenueSettingsInput, { tab: "branding" }>,
  before: VenueDoc,
): void {
  for (const field of ["logoUrl", "coverUrl"] as const) {
    const url = input[field];
    if (
      url &&
      url !== before.branding?.[field] &&
      !isVenueBlobUrl(url, venueId, "venue")
    )
      throw new AppError(400, "validation_failed", {
        [field]: "validation.url.invalid",
      });
  }
}

/** A replaced or removed logo or cover leaves the public store; a failed delete never undoes the save. */
async function deleteReplacedImages(
  actor: Actor,
  venueId: string,
  { before, after }: { before: VenueSettings; after: VenueSettings },
): Promise<void> {
  for (const field of ["logoUrl", "coverUrl"] as const) {
    const old = before.branding[field];
    if (
      old &&
      old !== after.branding[field] &&
      isVenueBlobUrl(old, venueId, "venue")
    )
      await deleteBlob(actor, { venueId, kind: "venue", url: old }).catch(
        reportError,
      );
  }
}
