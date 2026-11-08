"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { ReportProblem } from "@/components/report-problem/report-problem";
import { orderApi, OrderApiError } from "@/lib/order-api";

type SendState = "idle" | "sending" | "sent" | "limit" | "invalid" | "failed";

/** Print and e-mail; hidden on paper, where only the confirmation itself belongs. */
export function ConfirmationActions({
  orderId,
  token,
  backHref,
}: {
  orderId: string;
  token: string;
  backHref: string;
}) {
  const t = useTranslations("order.confirmation");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SendState>("idle");

  async function send(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      await orderApi.sendConfirmationEmail(orderId, token, { email, locale });
      setState("sent");
    } catch (error) {
      const status = error instanceof OrderApiError ? error.status : 0;
      setState(
        status === 429 ? "limit" : status === 400 ? "invalid" : "failed",
      );
    }
  }

  const message =
    state === "sent" ? (
      <p role="status" className="text-body text-success">
        {t("email.sent")}
      </p>
    ) : state === "limit" || state === "invalid" || state === "failed" ? (
      <p role="alert" className="text-body text-danger">
        {t(`email.${state}`)}
      </p>
    ) : null;

  return (
    <section className="flex flex-col gap-6 print:hidden">
      <Button variant="secondary" onClick={() => window.print()}>
        {t("print")}
      </Button>

      <form onSubmit={send} className="flex flex-col gap-3">
        <Label htmlFor="confirmation-email" className="text-small font-medium">
          {t("email.label")}
        </Label>
        <Input
          id="confirmation-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === "invalid" || undefined}
        />
        <Button
          type="submit"
          loading={state === "sending"}
          disabled={state === "limit"}
        >
          {t("email.send")}
        </Button>
        {message}
      </form>

      <ReportProblem orderId={orderId} token={token} />

      <Button variant="ghost" asChild>
        <a href={backHref}>{t("back")}</a>
      </Button>
    </section>
  );
}
