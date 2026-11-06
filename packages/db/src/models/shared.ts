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
): Model<InferSchemaType<TSchema>> {
  return (
    (models[name] as Model<InferSchemaType<TSchema>> | undefined) ??
    model<InferSchemaType<TSchema>>(name, schema)
  );
}
