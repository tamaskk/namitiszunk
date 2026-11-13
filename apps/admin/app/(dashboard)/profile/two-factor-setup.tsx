"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { type FormEvent, useState } from "react";

import { authApi } from "@/lib/auth-api";

type Setup = { qr: string; secret: string; backupCodes: string[] };

/** Turns on TOTP: scan the code, keep the backup codes, confirm with one code from the app. */
export function TwoFactorSetup() {
  const t = useTranslations("admin.profile.twoFactor");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "failed">("idle");

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

  async function verify(event: FormEvent) {
    event.preventDefault();
    // Checked here, not with `pattern`: the browser's own bubble is not translated.
    if (!/^\d{6}$/.test(code.trim())) {
      setState("failed");
      return;
    }
    setState("checking");
    if (await authApi.verifyTotp(code.trim())) {
      // The check rotated the session: a full load picks up the verified one.
      window.location.reload();
      return;
    }
    setState("failed");
  }

  if (!setup)
    return (
      <>
        <p className="text-body">{t("off")}</p>
        {startFailed && (
          <p role="alert" className="text-small text-danger">
            {t("startFailed")}
          </p>
        )}
        <Button className="self-start" loading={starting} onClick={start}>
          {t("start")}
        </Button>
      </>
    );

  return (
    <>
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
      <div className="flex flex-col gap-2">
        <h3 className="text-body font-medium">{t("backupTitle")}</h3>
        <p className="text-small text-text-muted">{t("backupBody")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-small">
          {setup.backupCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
      </div>
      <form onSubmit={verify} className="flex flex-col gap-3">
        <Label htmlFor="profile-totp">{t("codeLabel")}</Label>
        <Input
          id="profile-totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="tabular-nums"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={state === "failed" || undefined}
          aria-describedby={
            state === "failed" ? "profile-totp-error" : undefined
          }
        />
        {state === "failed" && (
          <p
            id="profile-totp-error"
            role="alert"
            className="text-small text-danger"
          >
            {t("failed")}
          </p>
        )}
        <Button
          type="submit"
          className="self-start"
          loading={state === "checking"}
        >
          {t("submit")}
        </Button>
      </form>
    </>
  );
}
