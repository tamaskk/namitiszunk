async function auth(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Better Auth on the HQ app's own origin (T-066): its cookie is the HQ session. */
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
  /** The 2FA step; true when the code was accepted. */
  async verifyTotp(code: string): Promise<boolean> {
    const res = await auth("/two-factor/verify-totp", { code }).catch(
      () => null,
    );
    return res?.ok ?? false;
  },
  /**
   * Starts TOTP setup: the authenticator URI and the backup codes; 2FA is on only once
   * `verifyTotp` accepts a code from the app. null when the start failed.
   */
  async enableTwoFactor(): Promise<{
    totpURI: string;
    backupCodes: string[];
  } | null> {
    const res = await auth("/two-factor/enable", { method: "totp" }).catch(
      () => null,
    );
    if (!res?.ok) return null;
    return (await res.json()) as { totpURI: string; backupCodes: string[] };
  },
  /** A one-time backup code instead of the app's code; true when it was accepted. */
  async verifyBackupCode(code: string): Promise<boolean> {
    const res = await auth("/two-factor/verify-backup-code", { code }).catch(
      () => null,
    );
    return res?.ok ?? false;
  },
  signOut: () => auth("/sign-out", {}).catch(() => null),
};
