"use client";

import { Button } from "@namitiszunk/ui";
import type { ReorderResponse } from "@namitiszunk/validators";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { addToCart, lineKey } from "@/components/cart/use-cart";
import { meApi } from "@/lib/account-api";
import { menuHref } from "@/lib/menu-href";
import { orderApi } from "@/lib/order-api";

type State =
  | { kind: "idle" | "loading" | "failed" }
  | { kind: "skipped"; href: string; skipped: string[]; none: boolean };

/**
 * "Rendeld újra" (T-045, T-047): puts the order's lines in the cart at today's prices and opens the
 * same bar's menu. With a guest token it asks for that order; without one, for the signed-in account's.
 */
export function ReorderButton({
  orderId,
  token,
}: {
  orderId: string;
  token?: string;
}) {
  const t = useTranslations("order.reorder");
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function reorder() {
    setState({ kind: "loading" });
    let cart: ReorderResponse;
    try {
      cart = token
        ? await orderApi.reorder(orderId, token)
        : await meApi.reorder(orderId);
    } catch {
      setState({ kind: "failed" });
      return;
    }
    addToCart(
      cart.venueId,
      cart.lines.map((line) => ({
        key: lineKey(line.itemId, line.modifierIds),
        itemId: line.itemId,
        name: locale === "en" ? (line.nameEn ?? line.name) : line.name,
        unitPriceHuf: line.unitPriceHuf,
        quantity: line.quantity,
        modifierIds: line.modifierIds,
        options: line.options,
      })),
    );
    const href = menuHref(locale, cart);
    if (cart.skipped.length === 0) {
      router.push(href);
      return;
    }
    // Something is gone from the menu: say what before the guest sees a shorter cart.
    setState({
      kind: "skipped",
      href,
      skipped: cart.skipped,
      none: cart.lines.length === 0,
    });
  }

  if (state.kind === "skipped") {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-body text-text-muted">
          {state.none
            ? t("noneAvailable")
            : t("skipped", { items: state.skipped.join(", ") })}
        </p>
        <Button variant="secondary" asChild>
          <a href={state.href}>{t("toMenu")}</a>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        loading={state.kind === "loading"}
        onClick={reorder}
      >
        {t("again")}
      </Button>
      {state.kind === "failed" && (
        <p role="alert" className="text-small text-danger">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
