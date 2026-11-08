import { getAuth, userActorFromHeaders } from "@namitiszunk/auth";
import { listAccountOrders } from "@namitiszunk/core/account";
import type { Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Suspense } from "react";

import { ensureDb } from "@/lib/db";

import { OrderLoading } from "../o/[orderId]/order-loading";
import { AccountView } from "./account-view";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/fiok">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "order.account",
  });
  return {
    title: t("pageTitle"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

// The guest account (T-047): optional, never needed to order.
export default function AccountPage(props: PageProps<"/[locale]/fiok">) {
  return (
    <Suspense fallback={<OrderLoading />}>
      <Account {...props} />
    </Suspense>
  );
}

const notices = ["signedOut", "deleted"] as const;

async function Account({ params, searchParams }: PageProps<"/[locale]/fiok">) {
  const { locale } = await params;
  const { notice } = await searchParams;
  setRequestLocale(locale as Locale);
  await ensureDb();
  const actor = await userActorFromHeaders(
    await getAuth("order"),
    "order",
    await headers(),
  );
  const t = await getTranslations("order.account");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-8 px-4 py-6">
      {actor ? (
        <>
          <h1 className="text-h1">{t("title")}</h1>
          <AccountView orders={await listAccountOrders(actor)} />
        </>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-h1">{t("signInTitle")}</h1>
            <p className="text-body text-text-muted">{t("signInBody")}</p>
          </header>
          <SignInForm
            notice={
              notices.find((n) => n === notice) &&
              t(`notice.${notices.find((n) => n === notice)!}`)
            }
          />
        </>
      )}
    </main>
  );
}
