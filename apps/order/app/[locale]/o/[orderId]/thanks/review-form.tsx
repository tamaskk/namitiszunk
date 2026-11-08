"use client";

import { Button, cn, Label, Textarea } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { orderApi, OrderApiError } from "@/lib/order-api";

type SendState = "idle" | "sending" | "sent" | "already" | "failed";

/** 1–5 stars as a native radio group (arrow keys work), an optional comment of up to 500 characters. */
export function ReviewForm({
  orderId,
  token,
  alreadyReviewed,
}: {
  orderId: string;
  token: string;
  alreadyReviewed: boolean;
}) {
  const t = useTranslations("order.thanks");
  const [stars, setStars] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [missingStars, setMissingStars] = useState(false);
  const [state, setState] = useState<SendState>(
    alreadyReviewed ? "already" : "idle",
  );

  const done = state === "sent" || state === "already";
  const result = useRef<HTMLParagraphElement>(null);
  // The form unmounts on success: move focus to the result so it is not lost to <body>.
  useEffect(() => {
    if (state === "sent") result.current?.focus();
  }, [state]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (stars === null) {
      setMissingStars(true);
      return;
    }
    setState("sending");
    try {
      await orderApi.review(orderId, token, {
        stars,
        ...(text.trim() ? { text: text.trim() } : {}),
      });
      setState("sent");
    } catch (error) {
      const status = error instanceof OrderApiError ? error.status : 0;
      setState(status === 409 ? "already" : "failed");
    }
  }

  return (
    <>
      {/* Mounted from the start so screen readers announce the result. */}
      <p
        ref={result}
        tabIndex={-1}
        aria-live="polite"
        className="text-center text-body text-text-muted empty:hidden"
      >
        {done ? t(state) : ""}
      </p>
      {!done && (
        <form
          onSubmit={send}
          className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6"
          noValidate
        >
          <fieldset
            className="flex flex-col gap-3"
            aria-describedby={missingStars ? "review-stars-error" : undefined}
          >
            <legend className="mb-2 text-h3">{t("rateTitle")}</legend>
            <div className="flex justify-between gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={cn(
                    "flex size-12 cursor-pointer items-center justify-center rounded-md border border-border text-h3 has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-bg",
                    stars !== null && n <= stars
                      ? "border-primary bg-primary text-on-primary"
                      : "bg-bg text-text-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="stars"
                    value={n}
                    checked={stars === n}
                    onChange={() => {
                      setStars(n);
                      setMissingStars(false);
                    }}
                    className="sr-only"
                    aria-label={t("star", { count: n })}
                  />
                  {/* Filled versus outline: the choice reads without colour too. */}
                  <span aria-hidden="true">
                    {stars !== null && n <= stars ? "★" : "☆"}
                  </span>
                </label>
              ))}
            </div>
            {missingStars && (
              <p
                id="review-stars-error"
                role="alert"
                className="text-small text-danger"
              >
                {t("chooseStars")}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="review-text" className="text-small font-medium">
              {t("text")}
            </Label>
            <Textarea
              id="review-text"
              maxLength={500}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {state === "failed" && (
            <p role="alert" className="text-body text-danger">
              {t("failed")}
            </p>
          )}

          <Button type="submit" loading={state === "sending"}>
            {t("send")}
          </Button>
        </form>
      )}
    </>
  );
}
