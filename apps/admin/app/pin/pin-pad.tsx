"use client";

import { Button } from "@namitiszunk/ui";
import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

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
  const [pending, startTransition] = useTransition();

  function press(digit: string) {
    if (!member || pending) return;
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
        <h2 id="pin-title" className="text-h2">
          {t("pinFor", { name: member.name })}
        </h2>
        <p
          aria-live="polite"
          aria-label={t("pinProgress", {
            count: pin.length,
            total: PIN_LENGTH,
          })}
          className="flex gap-3"
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={`size-4 rounded-full border border-border ${i < pin.length ? "bg-primary" : ""}`}
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
            disabled={pending}
            onClick={() => press(d)}
          >
            {d}
          </Button>
        ))}
        <Button
          size="bar"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setMember(null);
            setPin("");
            setError(null);
          }}
        >
          {t("back")}
        </Button>
        <Button
          size="bar"
          variant="secondary"
          disabled={pending}
          onClick={() => press("0")}
        >
          0
        </Button>
        <Button
          size="bar"
          variant="ghost"
          disabled={pending || pin.length === 0}
          aria-label={t("deleteDigit")}
          onClick={() => setPin(pin.slice(0, -1))}
        >
          <Delete aria-hidden />
        </Button>
      </div>
    </section>
  );
}
