import { z } from "zod";

import { objectIdSchema } from "./shared";
import { pinSchema } from "./staff";

// The bar view (T-054): the tablet's list and its one-tap actions.

/** The status changes a bartender makes by tapping a card; rejection has its own route. */
export const barOrderEvents = [
  "start_preparing",
  "mark_ready",
  "pick_up",
] as const;
export const barOrderEventInputSchema = z.object({
  event: z.enum(barOrderEvents),
});

export const barRejectReasons = ["sold_out", "other"] as const;
export const barRejectInputSchema = z
  .object({
    reason: z.enum(barRejectReasons),
    /** The order's items to mark sold out; required with "sold_out". */
    soldOutItemIds: z.array(objectIdSchema).max(30).optional(),
  })
  .refine(
    (input) => input.reason !== "sold_out" || !!input.soldOutItemIds?.length,
    { path: ["soldOutItemIds"], message: "validation.required" },
  );

export const receiptInputSchema = z.object({ entered: z.boolean() });

export const barPauseInputSchema = z.object({
  minutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]),
});

/** A manager turns this browser into the venue's bar tablet, opening on one bar. */
export const registerDeviceInputSchema = z.object({ barId: objectIdSchema });
/** A bartender taps their name and types their PIN on the tablet. */
export const devicePinSignInInputSchema = z.object({
  memberId: objectIdSchema,
  pin: pinSchema,
});

export const moveOrderInputSchema = z.object({ barId: objectIdSchema });

const isoDate = z.iso.datetime();

export const barViewOrderSchema = z.object({
  id: z.string(),
  shortNumber: z.int().nullable(),
  status: z.enum(["new", "preparing", "ready", "expired"]),
  version: z.number(),
  isVip: z.boolean(),
  adult: z.boolean(),
  items: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      quantity: z.int(),
      options: z.array(z.string()),
    }),
  ),
  paidAt: isoDate,
  acceptedAt: isoDate.nullable(),
  readyAt: isoDate.nullable(),
  receiptEnteredBy: z.string().nullable(),
  reminderSentAt: isoDate.nullable(),
});

export const barViewResponseSchema = z.object({
  bar: z.object({
    id: z.string(),
    name: z.string(),
    pausedUntil: isoDate.nullable(),
    maxActiveOrders: z.int().nullable(),
  }),
  otherBars: z.array(z.object({ id: z.string(), name: z.string() })),
  products: z.array(
    z.object({ id: z.string(), name: z.string(), isAvailable: z.boolean() }),
  ),
  orders: z.array(barViewOrderSchema),
  averagePrepMinutes: z.number().nullable(),
});

export const barPauseResponseSchema = z.object({
  pausedUntil: isoDate.nullable(),
});
export const reminderResponseSchema = z.object({
  channel: z.enum(["push", "sms", "none"]),
});
export const okResponseSchema = z.object({ ok: z.literal(true) });

export type BarOrderEvent = (typeof barOrderEvents)[number];
export type BarViewResponse = z.infer<typeof barViewResponseSchema>;
export type BarViewOrder = z.infer<typeof barViewOrderSchema>;
