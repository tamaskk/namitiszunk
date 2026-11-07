import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

/** Integer forints, never floats (ARCHITECTURE §06). */
export function huf(options: { required?: boolean; default?: number } = {}) {
  return {
    type: Number,
    required: options.required ?? true,
    default: options.default,
    min: 0,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: "{PATH} must be a whole number of forints",
    },
  };
}

export const objectId = Schema.Types.ObjectId;

// Reuses the compiled model on hot reload instead of throwing OverwriteModelError.
export function defineModel<TSchema extends Schema>(
  name: string,
  schema: TSchema,
  collection?: string,
): Model<InferSchemaType<TSchema>> {
  return (
    (models[name] as Model<InferSchemaType<TSchema>> | undefined) ??
    model<InferSchemaType<TSchema>>(name, schema, collection)
  );
}

const deleteQueries = ["deleteOne", "deleteMany", "findOneAndDelete"] as const;
const updateQueries = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
] as const;

/**
 * Mongoose-level safety net for archive-only and append-only collections.
 * shortcut: Model.collection.* and the raw driver bypass it; an Atlas role is the real guard (T-014).
 */
export function forbidWrites(
  schema: Schema,
  message: string,
  { updates = false }: { updates?: boolean } = {},
): void {
  const refuse = (): never => {
    throw new Error(message);
  };
  const queries = updates
    ? [...deleteQueries, ...updateQueries]
    : [...deleteQueries];
  schema.pre(queries, { document: false, query: true }, refuse);
  schema.pre("deleteOne", { document: true, query: false }, refuse);
  if (updates) {
    schema.pre("updateOne", { document: true, query: false }, refuse);
    schema.pre("save", function () {
      if (!this.isNew) refuse();
    });
  }
  schema.pre("bulkWrite", function (ops) {
    const blocked = updates
      ? ["deleteOne", "deleteMany", "updateOne", "updateMany", "replaceOne"]
      : ["deleteOne", "deleteMany"];
    if (ops.some((op) => blocked.some((kind) => kind in op))) refuse();
  });
}

/** Percent values are basis points: 10000 = 100%. */
export function capPercent(
  schema: Schema,
  typePath: string,
  valuePath: string,
): void {
  schema.pre("validate", function () {
    const value: unknown = this.get(valuePath);
    if (
      this.get(typePath) === "percent" &&
      typeof value === "number" &&
      value > 10000
    ) {
      this.invalidate(
        valuePath,
        `${valuePath} cannot exceed 10000 basis points (100%)`,
      );
    }
  });
}
