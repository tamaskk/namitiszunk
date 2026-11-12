import { put } from "@vercel/blob/client";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/**
 * Uploads straight to Blob with a one-time token from apps/api; the file never passes our servers.
 * product: a menu item image (menu.edit); venue: the logo or cover (venue.editSettings).
 */
export async function uploadImage(
  venueId: string,
  kind: "product" | "venue",
  file: File,
): Promise<string> {
  const res = await fetch(`${API}/v1/uploads`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ venueId, kind }),
  });
  if (!res.ok) throw new Error(`upload token ${res.status}`);
  const { data } = (await res.json()) as {
    data: { clientToken: string; pathname: string };
  };
  const blob = await put(data.pathname, file, {
    access: "public",
    token: data.clientToken,
    contentType: file.type,
  });
  return blob.url;
}
