import { Button, EmptyState } from "@namitiszunk/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { connection } from "next/server";

import { acceptInviteAction } from "./actions";
import { AcceptButton } from "./accept-button";
import { inviteSession } from "./invite-session";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.invite");
  return { title: t("title"), robots: { index: false, follow: false } };
}

const tokenFormat = /^[A-Za-z0-9_-]{43}$/;

/**
 * The link in a Manager or Owner invite e-mail (T-057): sign in with the invited address, then
 * accept. Expired, used and unknown links get the same message (acceptStaffInvite's 404).
 */
export default async function InvitePage({
  searchParams,
}: PageProps<"/invite">) {
  const [{ token, error }, t, requestHeaders] = await Promise.all([
    searchParams,
    getTranslations("admin.invite"),
    headers(),
  ]);
  const value = typeof token === "string" ? token : "";

  let body;
  if (error === "invite_conflict") {
    body = (
      <EmptyState
        role="alert"
        message={t("conflict")}
        action={
          <Button asChild>
            <Link href="/">{t("home")}</Link>
          </Button>
        }
      />
    );
  } else if (error || !tokenFormat.test(value)) {
    body = (
      <EmptyState
        role="alert"
        message={t("invalid")}
        action={
          <Button asChild>
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        }
      />
    );
  } else {
    // The staff device check reads the clock: request time, never prerendered.
    await connection();
    const signedIn = await inviteSession(requestHeaders);
    body = signedIn ? (
      <form action={acceptInviteAction} className="flex flex-col gap-4">
        <p className="text-body">
          {t("acceptAs", { email: signedIn.session.user.email })}
        </p>
        <input type="hidden" name="token" value={value} />
        <AcceptButton label={t("accept")} />
      </form>
    ) : (
      <div className="flex flex-col gap-4">
        <p className="text-body">{t("signInFirst")}</p>
        <Button asChild className="self-start">
          <Link href={`/sign-in?invite=${value}`}>{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-8 px-4 py-6">
      <h1 className="text-h1">{t("title")}</h1>
      {body}
    </main>
  );
}
