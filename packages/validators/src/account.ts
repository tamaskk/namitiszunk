import { z } from "zod";

import { orderStatuses } from "./orders";
import { hufSchema, objectIdSchema } from "./shared";

/** The guest's orders remembered on this device (T-043), handed over at sign-in (T-047). */
export const claimOrdersInputSchema = z.object({
  orders: z
    .array(
      z.object({
        orderId: objectIdSchema,
        token: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      }),
    )
    .max(50),
});
export type ClaimOrdersInput = z.infer<typeof claimOrdersInputSchema>;

export const claimOrdersResponseSchema = z.object({ claimed: z.int().min(0) });

export const accountOrderSchema = z.object({
  id: objectIdSchema,
  /** "#214"; null for an order that was never paid (T-024). */
  number: z.string().nullable(),
  venueName: z.string(),
  venueSlug: z.string(),
  status: z.enum(orderStatuses),
  createdAt: z.iso.datetime(),
  totalHuf: hufSchema,
  items: z.array(
    z.object({
      name: z.string(),
      nameEn: z.string().optional(),
      quantity: z.int().min(1),
    }),
  ),
});
export type AccountOrder = z.infer<typeof accountOrderSchema>;
export const accountOrdersResponseSchema = z.array(accountOrderSchema);

/** An order's lines as a cart at today's prices; `skipped` names the lines that cannot be ordered now. */
export const reorderResponseSchema = z.object({
  venueId: objectIdSchema,
  venueSlug: z.string(),
  barId: objectIdSchema,
  zoneId: objectIdSchema.optional(),
  lines: z.array(
    z.object({
      itemId: objectIdSchema,
      name: z.string(),
      nameEn: z.string().optional(),
      unitPriceHuf: hufSchema,
      quantity: z.int().min(1),
      modifierIds: z.array(objectIdSchema),
      options: z.array(z.string()),
    }),
  ),
  skipped: z.array(z.string()),
});
export type ReorderResponse = z.infer<typeof reorderResponseSchema>;

export const deleteAccountResponseSchema = z.object({
  ordersDetached: z.int().min(0),
});

/** GDPR export; its shape is documented loosely, the fields are listed in core (exportAccountData). */
export const accountExportResponseSchema = z.looseObject({
  exportedAt: z.iso.datetime(),
  profile: z.looseObject({}),
  logins: z.array(z.looseObject({})),
  orders: z.array(z.looseObject({})),
  reviews: z.array(z.looseObject({})),
});
