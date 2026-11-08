"use client";

import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  buttonVariants,
  cn,
  EmptyState,
  focusRing,
  Input,
  Label,
} from "@namitiszunk/ui";
import type {
  CreateOrderInput,
  OrderQuoteResponse,
  VenueStatusResponse,
} from "@namitiszunk/validators";
import { TIP_PERCENT_BPS } from "@namitiszunk/validators/cart-limits";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
} from "react";

import { useCart } from "@/components/cart/use-cart";
import { HoursNote } from "@/components/states/hours-note";
import { checkoutKeyFor, forgetCheckoutKey } from "@/lib/checkout-key";
import { rememberOpenOrder } from "@/lib/open-orders";
import { orderApi, OrderApiError } from "@/lib/order-api";
import { useVenueStatus } from "@/lib/use-venue-status";

import { useStripePayment } from "./use-stripe-payment";

type Tip = CreateOrderInput["tip"];
type Problem = { code: string } | null;

const noop = () => () => {};
const session = () => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

/** The checkout (T-042): summary, tip, SMS, 18+ and terms, then the Stripe Payment Element. */
export function CheckoutForm({
  venueId,
  slug,
  bar,
  zoneId,
  initialStatus,
  renderedAt,
  menuHref,
  publishableKey,
}: {
  venueId: string;
  bar: { id: string; name: string };
  slug: string;
  zoneId?: string;
  initialStatus: VenueStatusResponse;
  renderedAt: number;
  menuHref: string;
  publishableKey: string;
}) {
  const t = useTranslations("order.checkout");
  const tError = useTranslations("apiErrors");
  const tMenu = useTranslations("order.menu");
  type ApiErrorCode = Parameters<typeof tError>[0];
  // The code comes from the network: only a known one gets its own message.
  const apiErrorText = (code?: string) =>
    code && tError.has(code as ApiErrorCode)
      ? tError(code as ApiErrorCode)
      : undefined;
  const locale = useLocale();
  // Live, like the menu: a pause that ends while the guest is here unblocks Pay without a reload.
  const live = useVenueStatus(slug, bar.id, initialStatus, renderedAt);
  const open = live.status.status === "open";
  // The cart lives in localStorage: until hydration the page shows the skeleton, not "empty".
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const { lines, update } = useCart(venueId);
  const [tip, setTip] = useState<Tip>({ type: "percent", bps: 0 });
  const [customTip, setCustomTip] = useState("");
  const [sms, setSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [quote, setQuote] = useState<OrderQuoteResponse | null>(null);
  // The cart and tip the quote was made for: Pay waits until it matches what the guest sees.
  const [quotedKey, setQuotedKey] = useState<string | null>(null);
  const [quoteProblem, setQuoteProblem] = useState<Problem>(null);
  const [retries, setRetries] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [payProblem, setPayProblem] = useState<string | null>(null);
  const paymentHeading = useRef<HTMLHeadingElement>(null);

  const cart = {
    barId: bar.id,
    ...(zoneId ? { zoneId } : {}),
    items: lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      modifierIds: line.modifierIds,
    })),
    tip,
  };
  const cartKey = JSON.stringify(cart);

  // The server prices every change; a short pause lets the guest finish typing a custom tip.
  useEffect(() => {
    if (!hydrated || lines.length === 0) return;
    let current = true;
    const timer = setTimeout(() => {
      orderApi
        .quote({ ...(JSON.parse(cartKey) as typeof cart), smsRequested: false })
        .then((next) => {
          if (!current) return;
          setQuote(next);
          setQuotedKey(cartKey);
          setQuoteProblem(null);
        })
        .catch((error: unknown) => {
          if (!current) return;
          setQuoteProblem({
            code: error instanceof OrderApiError ? (error.code ?? "") : "",
          });
        });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // cartKey stands for the cart, the bar and the tip; `open` prices again once a pause ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, hydrated, retries, open]);

  const {
    attach: attachPayment,
    ready: paymentReady,
    failed: paymentFailed,
    submit: submitPayment,
    confirm: confirmPayment,
  } = useStripePayment({
    publishableKey,
    stripeAccountId: quote?.stripeAccountId ?? null,
    amountHuf: quote?.totalHuf ?? null,
    locale,
  });

  if (!hydrated) return <div className="h-64 rounded-lg bg-surface" />;
  if (lines.length === 0)
    return (
      <EmptyState
        message={t("empty")}
        action={
          <Link
            href={menuHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("back")}
          </Link>
        }
      />
    );

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = /^\d{8,9}$/.test(phoneDigits);
  const blocked =
    !open ||
    quoteProblem?.code === "bar_paused" ||
    quoteProblem?.code === "bar_closed";
  const quoteCurrent = quote !== null && quotedKey === cartKey;

  async function pay(event: FormEvent) {
    event.preventDefault();
    const nextMissing = [
      ...(sms && !phoneValid ? ["phone"] : []),
      ...(adult ? [] : ["adult"]),
      ...(terms ? [] : ["terms"]),
    ];
    setMissing(nextMissing);
    setPayProblem(null);
    if (
      nextMissing.length > 0 ||
      !quote ||
      !quoteCurrent ||
      !paymentReady ||
      paying
    )
      return;

    setPaying(true);
    const input: CreateOrderInput = {
      ...cart,
      smsRequested: sms,
      ...(sms ? { guestPhone: `+36${phoneDigits}` } : {}),
      acceptedTermsVersion: quote.termsVersion,
    };
    try {
      // The Payment Element checks its own fields first; it shows its message itself.
      if (!(await submitPayment())) return setPaying(false);
      const created = await orderApi.create(
        input,
        checkoutKeyFor(input, session()),
      );
      if (!created.clientSecret || !created.guestToken) {
        // A replay after this order was paid elsewhere: the live page has it.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load, like below
        window.location.assign(`/${locale}/o/${created.orderId}`);
        return;
      }
      rememberOpenOrder({
        orderId: created.orderId,
        token: created.guestToken,
      });
      const liveUrl = `${window.location.origin}/${locale}/o/${created.orderId}?t=${encodeURIComponent(created.guestToken)}`;
      const error = await confirmPayment(created.clientSecret, liveUrl);
      if (error !== null) {
        setPayProblem(error || t("payFailed"));
        return setPaying(false);
      }
      update(() => []);
      forgetCheckoutKey(session());
      // A full load, so the proxy moves the token into the order's cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
      window.location.assign(liveUrl);
    } catch (error) {
      setPayProblem(
        (error instanceof OrderApiError && apiErrorText(error.code)) ||
          t("payFailed"),
      );
      setPaying(false);
    }
  }

  const tipOptions = TIP_PERCENT_BPS.map((bps) => ({
    key: `p${bps}`,
    label: bps === 0 ? t("tipNone") : t("tipPercent", { percent: bps / 100 }),
    checked: tip.type === "percent" && tip.bps === bps,
    choose: () => setTip({ type: "percent", bps }),
  }));
  const customChecked = tip.type === "custom";

  return (
    <>
      {/* inert while paying: no tap, Tab or screen reader reaches the form until Stripe answers. */}
      <form
        onSubmit={pay}
        noValidate
        inert={paying}
        className="flex flex-col gap-6"
      >
        <p className="text-body">{t("pickup", { bar: bar.name })}</p>

        <section
          aria-labelledby="checkout-summary"
          className="rounded-lg border border-border bg-surface p-6"
        >
          <h2 id="checkout-summary" className="text-h3 mb-4">
            {t("summary")}
          </h2>
          {quote ? (
            <dl className="flex flex-col gap-2 text-body">
              {quote.lines.map((line, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt>
                    {line.quantity} ×{" "}
                    {locale === "en" && line.nameEn ? line.nameEn : line.name}
                    {line.options.length > 0 && (
                      <span className="block text-small text-text-muted">
                        {line.options.join(", ")}
                      </span>
                    )}
                  </dt>
                  <dd className="tabular-nums">
                    {formatHuf(line.lineTotalHuf)}
                  </dd>
                </div>
              ))}
              <Row label={t("subtotal")} huf={quote.subtotalHuf} />
              {quote.discountHuf > 0 && (
                <Row label={t("discount")} huf={-quote.discountHuf} />
              )}
              {quote.serviceFeeHuf > 0 && (
                <Row label={t("serviceFee")} huf={quote.serviceFeeHuf} />
              )}
              {quote.tipHuf > 0 && <Row label={t("tip")} huf={quote.tipHuf} />}
              <div className="mt-2 flex justify-between gap-4 border-t border-border pt-4 font-semibold">
                <dt>{t("total")}</dt>
                <dd className="tabular-nums">{formatHuf(quote.totalHuf)}</dd>
              </div>
            </dl>
          ) : quoteProblem ? null : (
            <div
              aria-busy="true"
              className="h-24 rounded-sm bg-bg motion-safe:animate-pulse"
            />
          )}
          {quoteProblem && (
            <div role="alert" className="flex flex-col gap-3">
              <p className="text-body text-danger">
                {apiErrorText(quoteProblem.code) ?? t("quoteFailed")}
              </p>
              {quoteProblem.code === "items_unavailable" ? (
                <Link
                  href={menuHref}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("backToCart")}
                </Link>
              ) : (
                quoteProblem.code !== "bar_paused" &&
                quoteProblem.code !== "bar_closed" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setRetries((n) => n + 1)}
                  >
                    {t("retry")}
                  </Button>
                )
              )}
            </div>
          )}
        </section>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">{t("tip")}</legend>
          <div className="grid grid-cols-5 gap-2">
            {tipOptions.map((option) => (
              <ChoiceChip
                key={option.key}
                name="tip"
                checked={option.checked}
                onChange={option.choose}
              >
                {option.label}
              </ChoiceChip>
            ))}
            <ChoiceChip
              name="tip"
              checked={customChecked}
              onChange={() =>
                setTip({ type: "custom", amountHuf: Number(customTip) || 0 })
              }
            >
              {t("tipCustom")}
            </ChoiceChip>
          </div>
          {customChecked && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkout-tip" className="text-small font-medium">
                {t("tipCustomLabel")}
              </Label>
              <Input
                id="checkout-tip"
                inputMode="numeric"
                value={customTip}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCustomTip(digits);
                  setTip({ type: "custom", amountHuf: Number(digits) || 0 });
                }}
              />
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-3">
          <CheckRow id="checkout-sms" checked={sms} onChange={setSms}>
            {t("sms")}
          </CheckRow>
          {sms && (
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="checkout-phone"
                className="text-small font-medium"
              >
                {t("phone")}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-body text-text-muted" aria-hidden="true">
                  +36
                </span>
                <Input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={missing.includes("phone") || undefined}
                  aria-describedby="checkout-phone-hint"
                />
              </div>
              <p
                id="checkout-phone-hint"
                className={cn(
                  "text-small",
                  missing.includes("phone") ? "text-danger" : "text-text-muted",
                )}
              >
                {missing.includes("phone") ? t("phoneInvalid") : t("phoneHint")}
              </p>
            </div>
          )}
          <CheckRow
            id="checkout-adult"
            checked={adult}
            onChange={setAdult}
            error={missing.includes("adult") ? t("adultRequired") : undefined}
          >
            {t("adult")}
          </CheckRow>
          {/* shortcut: plain text until T-003 publishes the terms page to link here. */}
          <CheckRow
            id="checkout-terms"
            checked={terms}
            onChange={setTerms}
            error={missing.includes("terms") ? t("termsRequired") : undefined}
          >
            {t("terms")}
          </CheckRow>
        </div>

        <section
          aria-labelledby="checkout-payment"
          className="flex flex-col gap-3"
        >
          <h2
            id="checkout-payment"
            ref={paymentHeading}
            tabIndex={-1}
            // Focused by "Más fizetési mód" after a click, where focus-visible would not show.
            className="scroll-mt-4 rounded-sm text-h3 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-(--focus-offset)"
          >
            {t("payment")}
          </h2>
          {/* Stripe mounts the Payment Element here (card, Apple Pay, Google Pay, Link). */}
          <div ref={attachPayment} className="min-h-24" />
          {paymentFailed && (
            <div role="alert" className="flex flex-col gap-3">
              <p className="text-body text-danger">{t("paymentLoadFailed")}</p>
              {/* A fresh load retries Stripe.js; the cart is kept in storage. */}
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                {t("retry")}
              </Button>
            </div>
          )}
        </section>

        {/* One live region: paused or closed (a warning, as on the menu), offline, a failed payment, the hours. */}
        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {blocked && !quoteProblem ? (
            <p className="rounded-lg border border-warning bg-surface p-4 text-body">
              {live.status.status === "closed"
                ? t("closed")
                : tError("bar_paused")}
            </p>
          ) : (
            payProblem && <p className="text-body text-danger">{payProblem}</p>
          )}
          {live.stale && (
            <p className="rounded-lg border border-warning bg-surface p-4 text-body">
              {tMenu("offline")}
            </p>
          )}
          <HoursNote status={live.status} at={live.at} />
        </div>
        {payProblem && !blocked && (
          // The order stays awaiting payment: Pay below retries, this goes back to choose another method.
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              paymentHeading.current?.scrollIntoView({ block: "start" });
              paymentHeading.current?.focus();
            }}
          >
            {t("otherMethod")}
          </Button>
        )}

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-bg p-4">
          <div className="mx-auto max-w-120">
            <Button
              type="submit"
              className="w-full"
              loading={paying}
              disabled={
                blocked ||
                !quoteCurrent ||
                !paymentReady ||
                quoteProblem !== null
              }
            >
              {quote
                ? t("pay", { total: formatHuf(quote.totalHuf) })
                : t("title")}
            </Button>
          </div>
        </div>
      </form>
      {paying && (
        // Covers the page until Stripe answers: one tap, one charge.
        <div
          role="status"
          className="fixed inset-0 z-20 flex items-center justify-center bg-overlay p-4"
        >
          <p className="rounded-lg bg-surface p-6 text-center text-body">
            {t("paying")}
          </p>
        </div>
      )}
    </>
  );
}

function Row({ label, huf }: { label: string; huf: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatHuf(huf)}</dd>
    </div>
  );
}

function ChoiceChip({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: string;
}) {
  return (
    <label
      className={cn(
        "flex h-12 cursor-pointer items-center justify-center rounded-md border text-small font-medium has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-bg",
        checked
          ? "border-primary bg-primary text-on-primary"
          : "border-border bg-surface text-text",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="flex min-h-12 cursor-pointer items-center gap-3 text-body"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn("size-5 accent-primary", focusRing)}
        />
        {children}
      </label>
      {error && (
        <p id={`${id}-error`} className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
