import { Schema, type ClientSession, type InferSchemaType } from "mongoose";

import { defineModel, huf, objectId } from "./shared";

export const vatRates = [5, 18, 27] as const;
export const discountTypes = ["percent", "fixed"] as const;

const categorySchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    name: { type: String, required: true, trim: true },
    nameEn: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    archivedAt: Date,
  },
  { timestamps: true },
);
export const Category = defineModel("Category", categorySchema);
export type CategoryDoc = InferSchemaType<typeof categorySchema>;

const modifierGroupSchema = new Schema({
  name: { type: String, required: true, trim: true },
  nameEn: { type: String, trim: true },
  required: { type: Boolean, default: false },
  minSelect: { type: Number, min: 0, default: 0 },
  maxSelect: { type: Number, min: 1, default: 1 },
  modifiers: [
    {
      name: { type: String, required: true, trim: true },
      nameEn: { type: String, trim: true },
      priceDeltaHuf: huf({ default: 0 }),
    },
  ],
});

const itemSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    categoryId: { type: objectId, ref: "Category", required: true },
    name: { type: String, required: true, trim: true },
    nameEn: { type: String, trim: true },
    description: String,
    descriptionEn: String,
    priceHuf: huf(),
    vatRate: { type: Number, enum: vatRates, required: true },
    imageUrl: String,
    alcoholPercent: { type: Number, min: 0, max: 100 },
    allergens: [String],
    isAvailable: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    vipOnly: { type: Boolean, default: false },
    barIds: [{ type: objectId, ref: "Bar" }],
    modifierGroups: [modifierGroupSchema],
    archivedAt: Date,
  },
  { timestamps: true },
);

// Past orders point at menu items, so they are archived, never deleted (ARCHITECTURE §06).
function refuseDelete(): never {
  throw new Error("Menu items cannot be deleted; use archiveItem");
}
itemSchema.pre(
  ["deleteOne", "deleteMany", "findOneAndDelete"],
  { document: false, query: true },
  refuseDelete,
);
itemSchema.pre("deleteOne", { document: true, query: false }, refuseDelete);
itemSchema.pre("bulkWrite", function (ops) {
  if (ops.some((op) => "deleteOne" in op || "deleteMany" in op)) {
    refuseDelete();
  }
});

export const Item = defineModel("Item", itemSchema);
export type ItemDoc = InferSchemaType<typeof itemSchema>;

/** Hides an item from the menu for good; returns false when it does not exist. */
export async function archiveItem(
  itemId: string,
  session?: ClientSession,
): Promise<boolean> {
  const result = await Item.updateOne(
    { _id: itemId, archivedAt: { $exists: false } },
    { $set: { archivedAt: new Date(), isAvailable: false } },
    { session },
  );
  return result.matchedCount === 1;
}

const priceRuleSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    target: {
      type: { type: String, enum: ["item", "category"], required: true },
      id: { type: objectId, required: true },
    },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    startTime: String,
    endTime: String,
    discount: {
      type: { type: String, enum: discountTypes, required: true },
      // percent: basis points; fixed: forints.
      value: huf(),
    },
    validFrom: Date,
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const PriceRule = defineModel("PriceRule", priceRuleSchema);
export type PriceRuleDoc = InferSchemaType<typeof priceRuleSchema>;
