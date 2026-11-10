import "server-only";

import { AppError } from "@namitiszunk/core/errors";
import { revalidatePath } from "next/cache";

import { getAdminContext } from "@/lib/admin-context";

export type MenuActionResult<T = null> =
  { data: T } | { error: { code: string; fields?: Record<string, string> } };

/**
 * One wrapper for every menu action: validate, take the actor and venue from the session (never
 * from the client), call core (which checks the permission and writes the audit), refresh the
 * editor. Known refusals come back as codes; anything else is thrown for Sentry.
 */
// Structural, so the app needs no zod of its own: every schema here comes from @namitiszunk/validators.
type Schema<D> = {
  safeParse(input: unknown):
    | { success: true; data: D }
    | {
        success: false;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
};

export async function runMenuAction<D, T>(
  schema: Schema<D>,
  input: unknown,
  work: (
    data: D,
    context: Awaited<ReturnType<typeof getAdminContext>> & {
      venueId: string;
    },
  ) => Promise<T>,
  // The page to refresh; the bars module (T-053) shares this wrapper.
  path = "/menu",
): Promise<MenuActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.map(String).join("."),
        issue.message,
      ]),
    );
    return { error: { code: "validation_failed", fields } };
  }
  const context = await getAdminContext();
  if (!context.venue) return { error: { code: "forbidden" } };
  try {
    const data = await work(parsed.data, {
      ...context,
      venueId: context.venue.id,
    });
    revalidatePath(path);
    return { data };
  } catch (error) {
    if (error instanceof AppError)
      return { error: { code: error.code, fields: error.fields } };
    throw error;
  }
}
