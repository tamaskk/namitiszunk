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
  maxActiveOrders: z.int().min(1).optional(),
});

export const zoneInputSchema = z.object({
  barId: objectIdSchema,
  name: nameSchema,
  type: z.enum(zoneTypes),
});

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
