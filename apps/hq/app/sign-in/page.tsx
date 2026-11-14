import type { Metadata } from "next";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { loadHqContext } from "@/lib/hq-context";

import { SignInForm, TotpForm, TwoFactorSetup } from "./sign-in-form";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("hq.signIn");
  return { title: t("title") };
}

/**
 * HQ sign-in in the order the session needs it (T-066): e-mail link or Google, then the one-time
 * TOTP setup with backup codes, then a TOTP or backup code on every later sign-in. The step comes
 * from the session, never from the URL.
 */
export default async function SignInPage() {
  await connection();
  const [context, t] = await Promise.all([
    loadHqContext(await headers()),
    getTranslations("hq.signIn"),
  ]);
  if (context === "forbidden") forbidden();
  if (typeof context !== "string") redirect("/");

  const copy = {
    signIn: { title: t("title"), body: t("body") },
    setup: { title: t("setupTitle"), body: t("setupBody") },
    totp: { title: t("totpTitle"), body: t("totpBody") },
  }[context];
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-8 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{copy.title}</h1>
        <p className="text-body text-text-muted">{copy.body}</p>
      </header>
      {context === "signIn" && <SignInForm />}
      {context === "setup" && <TwoFactorSetup />}
      {context === "totp" && <TotpForm />}
    </main>
  );
}
