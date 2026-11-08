"use client";

import {
  Button,
  focusRing,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { orderApi, OrderApiError } from "@/lib/order-api";

const categories = ["not_received", "wrong_order", "payment", "other"] as const;
type Category = (typeof categories)[number];
type SendState = "idle" | "sending" | "sent" | "invalid" | "limit" | "failed";

/** "Report a problem" (T-046): a bottom sheet on the live, thanks and confirmation pages, after payment. */
export function ReportProblem({
  orderId,
  token,
}: {
  orderId: string;
  token: string;
}) {
  const t = useTranslations("order.report");
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [missingCategory, setMissingCategory] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!category) {
      setMissingCategory(true);
      return;
    }
    setState("sending");
    try {
      await orderApi.reportProblem(orderId, token, {
        category,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setState("sent");
    } catch (error) {
      const status = error instanceof OrderApiError ? error.status : 0;
      setState(
        status === 429 ? "limit" : status === 400 ? "invalid" : "failed",
      );
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">{t("button")}</Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("close")}>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        {state === "sent" ? (
          <p role="status" className="text-body text-success">
            {t("sent")}
          </p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-6" noValidate>
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={
                missingCategory ? "report-category-error" : undefined
              }
            >
              <legend className="mb-2 text-small font-medium">
                {t("category")}
              </legend>
              {categories.map((c) => (
                <label
                  key={c}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-body has-checked:border-primary"
                >
                  <input
                    type="radio"
                    name="category"
                    value={c}
                    checked={category === c}
                    onChange={() => {
                      setCategory(c);
                      setMissingCategory(false);
                    }}
                    className="size-5 accent-primary"
                  />
                  {t(`categories.${c}`)}
                </label>
              ))}
              {missingCategory && (
                <p
                  id="report-category-error"
                  role="alert"
                  className="text-small text-danger"
                >
                  {t("categoryRequired")}
                </p>
              )}
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="report-message"
                className="text-small font-medium"
              >
                {t("message")}
              </Label>
              {/* No Textarea primitive yet: same tokens as Input. */}
              <textarea
                id="report-message"
                maxLength={1000}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={cn(
                  "w-full rounded-sm border border-border bg-surface px-3 py-3 text-body text-text placeholder:text-text-muted",
                  focusRing,
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="report-email" className="text-small font-medium">
                {t("email")}
              </Label>
              <Input
                id="report-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby="report-email-hint"
                aria-invalid={state === "invalid" || undefined}
              />
              <p id="report-email-hint" className="text-small text-text-muted">
                {t("emailHint")}
              </p>
            </div>

            {(state === "invalid" ||
              state === "limit" ||
              state === "failed") && (
              <p role="alert" className="text-body text-danger">
                {t(state)}
              </p>
            )}

            <Button
              type="submit"
              loading={state === "sending"}
              disabled={state === "limit"}
            >
              {t("send")}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
