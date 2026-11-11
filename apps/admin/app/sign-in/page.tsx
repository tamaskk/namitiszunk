import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignInForm, TotpForm } from "./sign-in-form";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.signIn");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { step, invite } = await searchParams;
  // Only an invite token's shape gets through, so the return path cannot point anywhere else.
  const callbackUrl =
    typeof invite === "string" && /^[A-Za-z0-9_-]{43}$/.test(invite)
      ? `/invite?token=${invite}`
      : undefined;
  const totp = step === "2fa";
  const t = await getTranslations("admin.signIn");
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-8 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{totp ? t("totpTitle") : t("title")}</h1>
        <p className="text-body text-text-muted">
          {totp ? t("totpBody") : t("body")}
        </p>
      </header>
      {totp ? <TotpForm /> : <SignInForm callbackUrl={callbackUrl} />}
    </main>
  );
}
