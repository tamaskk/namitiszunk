"use client";

import {
  loadStripe,
  type Stripe,
  type StripeElementLocale,
  type StripeElements,
  type StripePaymentElement,
} from "@stripe/stripe-js";
import { useCallback, useEffect, useRef, useState } from "react";

// Stripe.js reads colours as values, not CSS variables: take them from the design tokens at runtime.
function appearanceFromTokens() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    theme: "night" as const,
    variables: {
      colorPrimary: token("--color-primary"),
      colorBackground: token("--color-surface"),
      colorText: token("--color-text"),
      colorDanger: token("--color-danger"),
      fontFamily: style.fontFamily,
      borderRadius: "6px",
    },
  };
}

/**
 * The Stripe Payment Element in deferred-intent mode (T-042): it shows before the order exists, priced
 * with the server quote; the PaymentIntent comes from POST /v1/orders at "Pay". Direct charge: Stripe.js
 * runs on the venue's connected account.
 */
export function useStripePayment({
  publishableKey,
  stripeAccountId,
  amountHuf,
  locale,
}: {
  publishableKey: string;
  stripeAccountId: string | null;
  amountHuf: number | null;
  locale: string;
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const element = useRef<StripePaymentElement | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    if (!node || !stripeAccountId || !amountHuf || loading.current) return;
    loading.current = true;
    loadStripe(publishableKey, {
      stripeAccount: stripeAccountId,
      locale: locale as StripeElementLocale,
    }).then(
      (loaded) => {
        if (!loaded) return setFailed(true);
        // HUF goes to Stripe in fillér, as createOrder sends it.
        const created = loaded.elements({
          mode: "payment",
          amount: amountHuf * 100,
          currency: "huf",
          appearance: appearanceFromTokens(),
        });
        const payment = created.create("payment", { layout: "tabs" });
        payment.on("ready", () => setReady(true));
        payment.on("loaderror", () => setFailed(true));
        payment.mount(node);
        element.current = payment;
        setStripe(loaded);
        setElements(created);
      },
      () => setFailed(true),
    );
  }, [node, stripeAccountId, amountHuf, publishableKey, locale]);

  // A new tip or cart changes the amount Apple Pay and Google Pay show.
  useEffect(() => {
    if (elements && amountHuf) elements.update({ amount: amountHuf * 100 });
  }, [elements, amountHuf]);

  useEffect(() => () => element.current?.destroy(), []);

  /** The Element's own checks; false when it shows an error itself. */
  const submit = useCallback(async () => {
    if (!elements) return false;
    const { error } = await elements.submit();
    return !error;
  }, [elements]);

  /** Pays the order's PaymentIntent; null on success, else Stripe's message in the page language. */
  const confirm = useCallback(
    async (clientSecret: string, returnUrl: string) => {
      if (!stripe || !elements) return "";
      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        // Cards and wallets finish here (3D Secure in Stripe's own modal); only redirect methods leave.
        redirect: "if_required",
      });
      return error ? (error.message ?? "") : null;
    },
    [stripe, elements],
  );

  return { attach: setNode, ready, failed, submit, confirm };
}
