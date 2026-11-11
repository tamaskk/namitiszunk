"use client";

import { Button } from "@namitiszunk/ui";
import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { unlockTabletAlerts } from "@/lib/tablet-alerts";

import { signInWithPinAction } from "./actions";

const PIN_LENGTH = 4;
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const knownErrors = ["pin_invalid", "pin_locked", "unauthorized"] as const;

/** Name first, then a 4-digit PIN that sends itself on the last digit: one hand, wet fingers. */
export function PinPad({
  members,
}: {
  members: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.pin");
  const [member, setMember] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = pending || locked;

  function press(digit: string) {
    if (!member || disabled) return;
    // The first tap is the user gesture browsers need before the board may play a sound.
    unlockTabletAlerts();
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;
    startTransition(async () => {
      const result = await signInWithPinAction({
        memberId: member.id,
        pin: next,
      });
      // Success redirects; only a refusal comes back.
      const code = result.error.code;
      // Locked for a few minutes: the pad stays off until the member is chosen again.
      setLocked(code === "pin_locked");
      setError(
        knownErrors.includes(code as (typeof knownErrors)[number])
          ? t(`errors.${code as (typeof knownErrors)[number]}`)
          : t("errors.generic"),
      );
      setPin("");
    });
  }

  if (!member)
    return (
      <section aria-labelledby="pin-who" className="flex flex-col gap-4">
        <h2 id="pin-who" className="text-h2">
          {t("who")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {members.map((m) => (
            <li key={m.id}>
              <Button
                size="bar"
                variant="secondary"
                className="w-full"
                onClick={() => setMember(m)}
              >
                {m.name}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <section
      aria-labelledby="pin-title"
      className="mx-auto flex w-full max-w-dialog flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="pin-title" className="flex-1 text-h2">
            {t("pinFor", { name: member.name })}
          </h2>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setMember(null);
              setPin("");
              setError(null);
              setLocked(false);
            }}
          >
            {t("back")}
          </Button>
        </div>
        <p role="status" className="flex gap-3">
          <span className="sr-only">
            {t("pinProgress", { count: pin.length, total: PIN_LENGTH })}
          </span>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={`size-4 rounded-full border ${i < pin.length ? "border-primary bg-primary" : "border-text-muted"}`}
            />
          ))}
        </p>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.map((d) => (
          <Button
            key={d}
            size="bar"
            variant="secondary"
            disabled={disabled}
            onClick={() => press(d)}
          >
            {d}
          </Button>
        ))}
        <span aria-hidden />
        <Button
          size="bar"
          variant="secondary"
          disabled={disabled}
          onClick={() => press("0")}
        >
          0
        </Button>
        <Button
          size="bar"
          variant="ghost"
          disabled={disabled || pin.length === 0}
          aria-label={t("deleteDigit")}
          onClick={() => setPin(pin.slice(0, -1))}
        >
          <Delete aria-hidden />
        </Button>
      </div>
    </section>
  );
}
