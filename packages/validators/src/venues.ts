import { z } from "zod";

import {
  blobUrlSchema,
  dateTimeSchema,
  hufSchema,
  nameSchema,
  objectIdSchema,
  percentAtMost100,
  timeOfDaySchema,
} from "./shared";

// Same literals as packages/db; packages/core/src/validators-sync.test.ts keeps them equal.
export const venueStatuses = ["draft", "active", "suspended"] as const;
export const serviceFeeTypes = ["none", "percent", "fixed"] as const;
export const zoneTypes = ["bar_area", "vip_table"] as const;

const addressSchema = z.object({
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(10).optional(),
});

export const serviceFeeSchema = z
  .object({
    type: z.enum(serviceFeeTypes),
    // percent: basis points; fixed: forints; none: 0.
    value: hufSchema,
  })
  .refine(percentAtMost100, {
    path: ["value"],
    error: "validation.bps.max",
  });

export const orderRulesInputSchema = z.object({
  autoAccept: z.boolean(),
  pickupDeadlineMinutes: z
    .int()
    .min(15, { error: "validation.pickupDeadline.min" })
    .max(60, { error: "validation.pickupDeadline.max" }),
  refundOnExpiry: z.boolean(),
  maxItemsPerOrder: z.int().min(1).optional(),
  minimumOrderHuf: hufSchema,
  lastOrderMinutesBeforeClose: z.int().min(0),
  serviceFee: serviceFeeSchema,
  smsEnabled: z.boolean(),
});

export const venueInputSchema = z.object({
  name: nameSchema,
  address: addressSchema.optional(),
  company: z
    .object({
      name: z.string().max(200).optional(),
      taxNumber: z.string().max(20).optional(),
      registrationNumber: z.string().max(20).optional(),
    })
    .optional(),
  businessDayStart: timeOfDaySchema.optional(),
  branding: z
    .object({
      logoUrl: blobUrlSchema.optional(),
      coverUrl: blobUrlSchema.optional(),
    })
    .optional(),
});

export const barInputSchema = z.object({
  name: nameSchema,
  isOpen: z.boolean().optional(),
  // null clears the limit; reaching it only warns (decision 2026-11-02).
  maxActiveOrders: z.int().min(1).max(999).nullable().optional(),
});

export const zoneInputSchema = z.object({
  barId: objectIdSchema,
  name: nameSchema,
  type: z.enum(zoneTypes),
});

export const updateBarInputSchema = z.object({
  id: objectIdSchema,
  input: barInputSchema,
});
export const updateZoneInputSchema = z.object({
  id: objectIdSchema,
  input: zoneInputSchema,
});

/**
 * The short code a printed QR carries (`/q/[code]`); it never changes once printed. New codes are
 * 8 unambiguous capitals (core `newQrCode`); the seed's `demo-vip-1` style must still resolve.
 */
export const qrCodeSchema = z.string().regex(/^[A-Za-z0-9-]{4,32}$/);
export const qrDownloadQuerySchema = z.object({
  format: z.enum(["png", "card", "poster"]),
});

export type BarInput = z.infer<typeof barInputSchema>;
export type ZoneInput = z.infer<typeof zoneInputSchema>;

/** What a guest may see about a venue: no company, Stripe or rule internals. */
export const publicVenueResponseSchema = z.object({
  id: objectIdSchema,
  slug: z.string(),
  name: z.string(),
  address: addressSchema.optional(),
  branding: z
    .object({
      logoUrl: z.string().optional(),
      coverUrl: z.string().optional(),
    })
    .optional(),
});

export const venueListResponseSchema = z.object({
  venues: z.array(publicVenueResponseSchema),
});

export type OrderRulesInput = z.infer<typeof orderRulesInputSchema>;
export type VenueInput = z.infer<typeof venueInputSchema>;
export type PublicVenueResponse = z.infer<typeof publicVenueResponseSchema>;

/** A venue's URL name, as in /v/{slug}. */
export const venueSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, {
    error: "validation.slug.invalid",
  });

/** Query of GET /api/venues/{slug}/status; `bar` comes from the QR code. */
export const venueStatusQuerySchema = z.object({
  bar: objectIdSchema.optional(),
});

export const barStates = ["open", "paused", "closed"] as const;

/** The live part of the guest menu, polled every 30 s (T-040). */
export const venueStatusResponseSchema = z.object({
  status: z.enum(barStates),
  pausedUntil: dateTimeSchema.nullable(),
  /** Median paid → ready minutes of the bar's last 30 minutes; null below 3 orders. */
  estimatedWaitMinutes: z.int().min(1).nullable(),
  soldOutItemIds: z.array(objectIdSchema),
  /** Last order of tonight's opening (T-048); null outside opening hours or without hours. */
  lastOrderAt: dateTimeSchema.nullable(),
  /** Next opening when closed by the hours; null when open or without hours. */
  nextOpenAt: dateTimeSchema.nullable(),
});

export type BarState = (typeof barStates)[number];
export type VenueStatusResponse = z.infer<typeof venueStatusResponseSchema>;

type Instant = Date | null;

/** The live status as JSON for the guest app: the service's dates as ISO strings. */
export const toVenueStatusResponse = (
  status: Omit<
    VenueStatusResponse,
    "pausedUntil" | "lastOrderAt" | "nextOpenAt"
  > & {
    pausedUntil: Instant;
    lastOrderAt: Instant;
    nextOpenAt: Instant;
  },
): VenueStatusResponse => ({
  ...status,
  pausedUntil: status.pausedUntil?.toISOString() ?? null,
  lastOrderAt: status.lastOrderAt?.toISOString() ?? null,
  nextOpenAt: status.nextOpenAt?.toISOString() ?? null,
});

/** The Admin top bar's venue-wide Open / Paused switch (T-050). */
export const setOrdersPausedSchema = z.object({
  /** The venue the user sees; core checks the membership and the role. */
  venueId: objectIdSchema,
  paused: z.boolean(),
});

/** The Admin venue switcher; the server checks the id against the user's memberships. */
export const selectVenueSchema = z.object({ venueId: objectIdSchema });

// Settings (T-058): one schema per tab, each saved on its own. An empty text field clears the value.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "validation.text.max" })
    .regex(/^[^\p{Cc}]*$/u, { error: "validation.name.invalid" });

/** Hungarian tax number: 8 digits, VAT code, county code (12345678-1-12). */
export const taxNumberSchema = z
  .string()
  .regex(/^\d{8}-[1-5]-\d{2}$/, { error: "validation.taxNumber.format" });

export const basicsSettingsSchema = z.object({
  name: nameSchema,
  address: z.object({
    street: optionalText(200),
    city: optionalText(100),
    postalCode: z
      .string()
      .regex(/^(\d{4})?$/, { error: "validation.postalCode.format" }),
  }),
  company: z.object({
    name: optionalText(200),
    taxNumber: taxNumberSchema.or(z.literal("")),
  }),
  contactEmail: z
    .email({ error: "validation.email.invalid" })
    .max(254, { error: "validation.email.invalid" })
    .or(z.literal("")),
});

export const openingHourSchema = z
  .object({
    day: z.int().min(1).max(7),
    open: timeOfDaySchema,
    close: timeOfDaySchema,
  })
  // A close before the open is the next morning (22:00–05:00); the same time would be 24 hours.
  .refine((h) => h.open !== h.close, {
    path: ["close"],
    error: "validation.hours.sameTime",
  });

export const hoursSettingsSchema = z.object({
  businessDayStart: timeOfDaySchema,
  openingHours: z
    .array(openingHourSchema)
    .max(7)
    .refine((hours) => new Set(hours.map((h) => h.day)).size === hours.length, {
      error: "validation.hours.dayTwice",
    }),
});

export const accentColorSchema = z
  .string()
  // Empty clears the colour; one regex, so a bad value gets the colour message, not a union error.
  .regex(/^(#[0-9a-fA-F]{6})?$/, { error: "validation.color.hex" })
  .transform((value) => value.toLowerCase());

export const brandingSettingsSchema = z.object({
  logoUrl: blobUrlSchema.or(z.literal("")),
  coverUrl: blobUrlSchema.or(z.literal("")),
  accentColor: accentColorSchema,
});

export const tipRulesSchema = z.object({
  enabled: z.boolean(),
  presetsBps: z
    .array(
      z
        .int({ error: "validation.tips.preset" })
        .min(1, { error: "validation.tips.preset" })
        .max(10_000, { error: "validation.tips.preset" }),
    )
    .length(3)
    .refine((values) => new Set(values).size === values.length, {
      error: "validation.tips.distinct",
    }),
});

export const orderSettingsSchema = orderRulesInputSchema
  .omit({ smsEnabled: true })
  .extend({
    maxItemsPerOrder: z
      .int()
      .min(1, { error: "validation.maxItems.range" })
      .max(99, { error: "validation.maxItems.range" }),
    lastOrderMinutesBeforeClose: z
      .int()
      .min(0, { error: "validation.lastOrder.range" })
      .max(120, { error: "validation.lastOrder.range" }),
    tips: tipRulesSchema,
  });

export const notificationSettingsSchema = z.object({ smsEnabled: z.boolean() });

/** One Settings tab's save: the tab names which part of the venue changes. */
export const venueSettingsInputSchema = z.discriminatedUnion("tab", [
  basicsSettingsSchema.extend({ tab: z.literal("basics") }),
  hoursSettingsSchema.extend({ tab: z.literal("hours") }),
  brandingSettingsSchema.extend({ tab: z.literal("branding") }),
  orderSettingsSchema.extend({ tab: z.literal("order") }),
  notificationSettingsSchema.extend({ tab: z.literal("notifications") }),
]);

export const settingsTabs = [
  "basics",
  "hours",
  "branding",
  "order",
  "notifications",
] as const;
export type SettingsTab = (typeof settingsTabs)[number];
export type VenueSettingsInput = z.infer<typeof venueSettingsInputSchema>;
export type OpeningHourInput = z.infer<typeof openingHourSchema>;
