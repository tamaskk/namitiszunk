import {
  deviceCookieName,
  listDeviceMembers,
  staffDeviceState,
} from "@namitiszunk/auth";
import { Button, EmptyState } from "@namitiszunk/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";

import { ensureDb } from "@/lib/db";

import { forgetRevokedDeviceAction } from "./actions";
import { PinPad } from "./pin-pad";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pin");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The bar tablet's sign-in (T-054): tap your name, type your PIN. */
export default async function PinPage() {
  // cookies() first: it makes the page dynamic, so the build never prerenders it and needs no database.
  const [t, jar] = await Promise.all([getTranslations("admin.pin"), cookies()]);
  // The device checks read the clock: render at request time, never at build.
  await connection();
  await ensureDb();
  const deviceCookie = jar.get(deviceCookieName)?.value;
  const [state, members] = await Promise.all([
    staffDeviceState(deviceCookie),
    listDeviceMembers(deviceCookie),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-8 px-4 py-6">
      <h1 className="text-h1">{t("title")}</h1>
      {state === "revoked" ? (
        <EmptyState
          message={t("revoked")}
          action={
            <form action={forgetRevokedDeviceAction}>
              <Button type="submit">{t("signInAgain")}</Button>
            </form>
          }
        />
      ) : members === null ? (
        <EmptyState
          message={t("notADevice")}
          action={
            <Button asChild>
              <Link href="/pult">{t("setUp")}</Link>
            </Button>
          }
        />
      ) : members.length === 0 ? (
        <EmptyState message={t("noMembers")} />
      ) : (
        <PinPad members={members} />
      )}
    </main>
  );
}
