// shortcut: the guest app's origin is fixed like apps/api's ORDER_APP; a Vercel preview links to production.
// Move to an env var if previews need their own order app.
export const ORDER_APP_URL =
  process.env.NODE_ENV === "production"
    ? "https://rendel.namitiszunk.hu"
    : "http://localhost:3001";

/** The guest menu of a venue, optionally at one bar, as the guest sees it after a scan. */
export function guestMenuUrl(
  slug: string,
  locale: string,
  barId: string | null,
): string {
  const url = new URL(`/${locale}/v/${slug}`, ORDER_APP_URL);
  if (barId) url.searchParams.set("bar", barId);
  return url.toString();
}
