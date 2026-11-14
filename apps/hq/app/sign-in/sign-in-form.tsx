"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { authApi } from "@/lib/auth-api";

// Every way in comes back to the overview; the sign-in page then shows the 2FA step still needed.
const CALLBACK_URL = "/";

/** A full load: the session cookie changed, so no router cache of the old one may stay. */
function enterHq() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops the router cache of the other session
  window.location.assign(CALLBACK_URL);
}

/** The first step: an e-mail link or Google (T-066). */
export function SignInForm() {
  const t = useTranslations("hq.signIn");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    "idle" | "sending" | "sent" | "failed" | "socialFailed"
  >("idle");
  const [google, setGoogle] = useState(false);
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state === "sent") result.current?.focus();
  }, [state]);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const sent = await authApi.sendMagicLink(email.trim(), CALLBACK_URL);
    setState(sent ? "sent" : "failed");
  }

  async function signInWithGoogle() {
    setGoogle(true);
    const url = await authApi.socialUrl("google", CALLBACK_URL);
    if (url) {
      window.location.assign(url);
      return;
    }
    setGoogle(false);
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
        <Label htmlFor="hq-email">{t("emailLabel")}</Label>
        <Input
          id="hq-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={state === "failed" || undefined}
          aria-describedby={state === "failed" ? "hq-email-error" : undefined}
        />
        {state === "failed" && (
          <p
            id="hq-email-error"
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
        <Button variant="secondary" loading={google} onClick={signInWithGoogle}>
          {t("google")}
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

/** One code field: the authenticator's 6 digits, or a backup code. */
function CodeForm({
  id,
  label,
  error,
  submit,
  numeric,
  check,
}: {
  id: string;
  label: string;
  error: string;
  submit: string;
  numeric: boolean;
  check: (code: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "failed">("idle");

  async function verify(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    // Checked here, not with `pattern`: the browser's own bubble is not translated.
    if (numeric ? !/^\d{6}$/.test(value) : value.length === 0) {
      setState("failed");
      return;
    }
    setState("checking");
    if (await check(value)) {
      enterHq();
      return;
    }
    setState("failed");
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={numeric ? "numeric" : "text"}
        autoComplete="one-time-code"
        maxLength={numeric ? 6 : 32}
        className="font-mono tabular-nums"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-invalid={state === "failed" || undefined}
        aria-describedby={state === "failed" ? `${id}-error` : undefined}
      />
      {state === "failed" && (
        <p id={`${id}-error`} role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={state === "checking"}>
        {submit}
      </Button>
    </form>
  );
}

/** Every later sign-in: the authenticator's code, or one of the backup codes. */
export function TotpForm() {
  const t = useTranslations("hq.signIn");
  const [backup, setBackup] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {backup ? (
        <CodeForm
          key="backup"
          id="hq-backup"
          label={t("backupLabel")}
          error={t("backupFailed")}
          submit={t("totpSubmit")}
          numeric={false}
          check={authApi.verifyBackupCode}
        />
      ) : (
        <CodeForm
          key="totp"
          id="hq-totp"
          label={t("totpLabel")}
          error={t("totpFailed")}
          submit={t("totpSubmit")}
          numeric
          check={authApi.verifyTotp}
        />
      )}
      <Button variant="ghost" onClick={() => setBackup(!backup)}>
        {backup ? t("useTotp") : t("useBackup")}
      </Button>
    </div>
  );
}

/** The first sign-in: scan the code, keep the backup codes (shown only now), confirm with a code. */
export function TwoFactorSetup() {
  const t = useTranslations("hq.signIn");
  const [setup, setSetup] = useState<{
    qr: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  async function start() {
    setStarting(true);
    setStartFailed(false);
    const result = await authApi.enableTwoFactor();
    if (!result) {
      setStarting(false);
      setStartFailed(true);
      return;
    }
    setSetup({
      qr: await QRCode.toDataURL(result.totpURI, { margin: 1, width: 192 }),
      secret: new URL(result.totpURI).searchParams.get("secret") ?? "",
      backupCodes: result.backupCodes,
    });
    setStarting(false);
  }

  if (!setup)
    return (
      <div className="flex flex-col gap-3">
        {startFailed && (
          <p role="alert" className="text-small text-danger">
            {t("setupStartFailed")}
          </p>
        )}
        <Button loading={starting} onClick={start}>
          {t("setupStart")}
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body">{t("scan")}</p>
      {/* A data URL from the qrcode package: next/image would add nothing for a local, generated image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={setup.qr}
        alt={t("qrAlt")}
        width={192}
        height={192}
        className="rounded-md bg-text p-2"
      />
      <p className="text-small text-text-muted">
        {t("secret")}{" "}
        <code className="break-all font-mono text-text">{setup.secret}</code>
      </p>
      <section
        aria-labelledby="hq-backup-title"
        className="flex flex-col gap-2"
      >
        <h2 id="hq-backup-title" className="text-h3">
          {t("backupTitle")}
        </h2>
        <p className="text-small text-text-muted">{t("backupBody")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-small">
          {setup.backupCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
      </section>
      <CodeForm
        id="hq-setup-totp"
        label={t("setupCodeLabel")}
        error={t("setupFailed")}
        submit={t("setupSubmit")}
        numeric
        check={authApi.verifyTotp}
      />
    </div>
  );
}
