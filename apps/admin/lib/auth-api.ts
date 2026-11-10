async function auth(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Better Auth on the admin app's own origin (T-030): its cookie is the admin session. */
export const authApi = {
  /** true when the e-mail went out; 429 and other refusals give false. */
  async sendMagicLink(email: string, callbackURL: string): Promise<boolean> {
    const res = await auth("/sign-in/magic-link", { email, callbackURL }).catch(
      () => null,
    );
    return res?.ok ?? false;
  },
  /** Google or Apple: the browser leaves for the provider; null when the start failed. */
  async socialUrl(
    provider: "google" | "apple",
    callbackURL: string,
  ): Promise<string | null> {
    const res = await auth("/sign-in/social", {
      provider,
      callbackURL,
      disableRedirect: true,
    }).catch(() => null);
    if (!res?.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  },
  /** The 2FA step of a member who turned it on; true when the code was accepted. */
  async verifyTotp(code: string): Promise<boolean> {
    const res = await auth("/two-factor/verify-totp", { code }).catch(
      () => null,
    );
    return res?.ok ?? false;
  },
  signOut: () => auth("/sign-out", {}).catch(() => null),
};
