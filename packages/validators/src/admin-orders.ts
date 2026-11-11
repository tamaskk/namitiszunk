import { z } from "zod";

import { orderStatuses } from "./orders";
import { objectIdSchema } from "./shared";

const businessDateSchema = z.iso.date();

// The longest export: one quarter keeps a single download small enough for a serverless response.
export const ORDERS_EXPORT_MAX_DAYS = 92;

/** How the guest paid: a plain card, or the wallet Stripe reports (Payment.wallet). */
export const paymentMethodFilters = [
  "card",
  "apple_pay",
  "google_pay",
] as const;

const wholeHuf = z
  .string()
  .regex(/^\d{1,7}$/)
  .transform(Number);

/** The Orders module's list filters (T-056), from the page's query string. Empty fields count as unset. */
export const adminOrdersQuerySchema = z.object({
  date: businessDateSchema.optional(),
  // "214" or "#214", the short number of the chosen business day.
  number: z
    .string()
    .regex(/^#?\d{1,6}$/)
    .transform((value) => Number(value.replace("#", "")))
    .optional(),
  status: z.enum(orderStatuses).optional(),
  bar: objectIdSchema.optional(),
  min: wholeHuf.optional(),
  max: wholeHuf.optional(),
  method: z.enum(paymentMethodFilters).optional(),
  problem: z.literal("1").optional(),
  receipt: z.literal("missing").optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
});

/** The Orders export (T-056): business days from–to, CSV or Excel. */
export const adminOrdersExportQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
    format: z.enum(["csv", "xlsx"]),
  })
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      return days >= 0 && days < ORDERS_EXPORT_MAX_DAYS;
    },
    { path: ["to"], error: "validation.exportRange" },
  );

export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;
export type AdminOrdersExportQuery = z.infer<
  typeof adminOrdersExportQuerySchema
>;
