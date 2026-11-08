// Shared by the proxy (edge) and the pages: no server-only imports here.

const guestPage = /^\/(?:[a-z]{2}\/)?(?:o|r)\/([a-f0-9]{24})(?:\/|$)/;
// A guest token is 16 random bytes in base64url (22 characters, as packages/auth checks); nothing else is stored.
const tokenFormat = /^[A-Za-z0-9_-]{22}$/;

/** One httpOnly cookie per order, so a phone can hold several open orders. */
export const guestTokenCookie = (orderId: string) => `gt_${orderId}`;

/**
 * A guest link (/o/[orderId]?t=…, /r/[orderId]?t=…): the order id, the token if it is well formed,
 * and the same URL without the token. Null for any other URL.
 */
export function readGuestLink(url: URL) {
  const token = url.searchParams.get("t");
  const match = guestPage.exec(url.pathname);
  if (token === null || !match) return null;
  const clean = new URL(url);
  clean.searchParams.delete("t");
  return {
    orderId: match[1]!,
    token: tokenFormat.test(token) ? token : null,
    clean,
  };
}
