"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { authApi } from "@/lib/account-api";

type State = "idle" | "sending" | "sent" | "failed" | "socialFailed";

/** Magic link, Google or Apple (T-030); every way lands back on /fiok signed in. */
export function SignInForm() {
  const t = useTranslations("order.account");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [social, setSocial] = useState<"google" | "apple" | null>(null);
  const callbackURL = `/${locale}/fiok`;

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const sent = await authApi.sendMagicLink(email.trim(), callbackURL);
    setState(sent ? "sent" : "failed");
  }

  async function signInWith(provider: "google" | "apple") {
    setSocial(provider);
    const url = await authApi.socialUrl(provider, callbackURL);
    if (url) {
      window.location.assign(url);
      return;
    }
    setSocial(null);
    setState("socialFailed");
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-body">
        {t("linkSent", { email: email.trim() })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <Label htmlFor="account-email">{t("emailLabel")}</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" loading={state === "sending"}>
          {t("sendLink")}
        </Button>
        {state === "failed" && (
          <p role="alert" className="text-small text-danger">
            {t("linkFailed")}
          </p>
        )}
      </form>
      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          loading={social === "google"}
          disabled={social !== null}
          onClick={() => signInWith("google")}
        >
          {t("google")}
        </Button>
        <Button
          variant="secondary"
          loading={social === "apple"}
          disabled={social !== null}
          onClick={() => signInWith("apple")}
        >
          {t("apple")}
        </Button>
        {state === "socialFailed" && (
          <p role="alert" className="text-small text-danger">
            {t("socialFailed")}
          </p>
        )}
      </div>
    </div>
  );
}
