"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { authApi } from "@/lib/auth-api";

type State = "idle" | "sending" | "sent" | "failed" | "socialFailed";

// Every way in lands on the dashboard; the shell sends a 2FA session back to the code step.
const CALLBACK_URL = "/";

/** Magic link, Google or Apple (T-030) for club members. */
export function SignInForm({
  callbackUrl = CALLBACK_URL,
}: {
  /** Where the sign-in returns: the invite page (T-057), else the dashboard. Built by the page, never from free input. */
  callbackUrl?: string;
}) {
  const t = useTranslations("admin.signIn");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [social, setSocial] = useState<"google" | "apple" | null>(null);
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state === "sent") result.current?.focus();
  }, [state]);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const sent = await authApi.sendMagicLink(email.trim(), callbackUrl);
    setState(sent ? "sent" : "failed");
  }

  async function signInWith(provider: "google" | "apple") {
    setSocial(provider);
    const url = await authApi.socialUrl(provider, callbackUrl);
    if (url) {
      window.location.assign(url);
      return;
    }
    setSocial(null);
    setState("socialFailed");
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-3">
        <p
          ref={result}
          tabIndex={-1}
          role="status"
          className="text-body outline-none"
        >
          {t("linkSent", { email: email.trim() })}
        </p>
        <Button variant="ghost" onClick={() => setState("idle")}>
          {t("otherAddress")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <Label htmlFor="admin-email">{t("emailLabel")}</Label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={state === "failed" || undefined}
          aria-describedby={
            state === "failed" ? "admin-email-error" : undefined
          }
        />
        {state === "failed" && (
          <p
            id="admin-email-error"
            role="alert"
            className="text-small text-danger"
          >
            {t("linkFailed")}
          </p>
        )}
        <Button type="submit" loading={state === "sending"}>
          {t("sendLink")}
        </Button>
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

/** The second step for a member who turned 2FA on: the authenticator app's code. */
export function TotpForm() {
  const t = useTranslations("admin.signIn");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "failed">("idle");

  async function verify(event: FormEvent) {
    event.preventDefault();
    // Checked here, not with `pattern`: the browser's own bubble is not translated.
    if (!/^\d{6}$/.test(code.trim())) {
      setState("failed");
      return;
    }
    setState("checking");
    if (await authApi.verifyTotp(code.trim())) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops the router cache of the other session
      window.location.assign(CALLBACK_URL);
      return;
    }
    setState("failed");
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <Label htmlFor="admin-totp">{t("totpLabel")}</Label>
      <Input
        id="admin-totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="tabular-nums"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-invalid={state === "failed" || undefined}
        aria-describedby={state === "failed" ? "admin-totp-error" : undefined}
      />
      {state === "failed" && (
        <p
          id="admin-totp-error"
          role="alert"
          className="text-small text-danger"
        >
          {t("totpFailed")}
        </p>
      )}
      <Button type="submit" loading={state === "checking"}>
        {t("totpSubmit")}
      </Button>
    </form>
  );
}
