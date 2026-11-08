import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { formatHuf, messages } from "@namitiszunk/i18n";
import { expect, test, type Page, type Route } from "@playwright/test";

import { setBarPaused } from "./db";

// Checkout (T-042). apps/api is not running here: the quote and order calls are answered with
// page.route, and a stand-in window.Stripe replaces Stripe.js (loadStripe uses one that is present).

const seedId = (key: string) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );

const { menu, product, cart, checkout } = messages.hu.order;
const bar = seedId("bar:main");
const zone = seedId("zone:dancefloor");
const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const guestToken = "g".repeat(22);
const colaHuf = 690;

/** A Payment Element that is ready at once and pays every card. */
function fakeStripe() {
  const calls: string[] = [];
  (window as unknown as { __stripeCalls: string[] }).__stripeCalls = calls;
  (window as unknown as { Stripe: unknown }).Stripe = () => ({
    elements: () => ({
      create: () => ({
        on: (event: string, handler: () => void) => {
          if (event === "ready") setTimeout(handler, 0);
        },
        mount: () => calls.push("mount"),
        destroy: () => {},
      }),
      update: () => calls.push("update"),
      submit: async () => ({}),
    }),
    confirmPayment: async () => {
      calls.push("confirm");
      return { paymentIntent: { status: "succeeded" } };
    },
  });
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Prices like the server for one Coca-Cola: subtotal plus the chosen tip. */
async function answerQuote(page: Page, tips: number[] = []) {
  await page.route("**/v1/orders/quote", async (route) => {
    const body = route.request().postDataJSON() as {
      tip: { type: string; bps?: number; amountHuf?: number };
    };
    const tipHuf =
      body.tip.type === "percent"
        ? Math.round((colaHuf * (body.tip.bps ?? 0)) / 10_000)
        : (body.tip.amountHuf ?? 0);
    tips.push(tipHuf);
    await json(route, 200, {
      data: {
        lines: [
          {
            name: "Coca-Cola",
            options: [],
            quantity: 1,
            lineTotalHuf: colaHuf,
          },
        ],
        subtotalHuf: colaHuf,
        discountHuf: 0,
        serviceFeeHuf: 0,
        tipHuf,
        totalHuf: colaHuf + tipHuf,
        stripeAccountId: "acct_1Demo",
        termsVersion: "draft-2026-11",
      },
    });
  });
}

/**
 * Menu → cart → checkout. `answer` registers the API stand-ins only on the way to checkout: a route
 * set before the menu loads keeps the product sheet from settling (Playwright's interception).
 */
async function cartToCheckout(page: Page, answer: () => Promise<void>) {
  await page.addInitScript(fakeStripe);
  // The Next.js dev badge sits over the fixed pay bar in dev; it never ships to production.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  await page.goto(`/hu/v/demo?bar=${bar}&zone=${zone}`);
  await page.getByRole("button", { name: menu.ageGate.yes }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: fill(product.addLabel, { name: "Coca-Cola" }),
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Kosárba/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Kosár · / }).click();
  await answer();
  await page.getByRole("button", { name: cart.continue }).click();
  await expect(
    page.getByRole("heading", { name: checkout.title, exact: true }),
  ).toBeVisible();
}

const payButton = (page: Page, totalHuf: number) =>
  page.getByRole("button", {
    name: fill(checkout.pay, { total: formatHuf(totalHuf) }),
  });

test("prices on the server with no tip by default, and a 10% tip changes the total", async ({
  page,
}) => {
  const tips: number[] = [];
  await cartToCheckout(page, () => answerQuote(page, tips));

  await expect(payButton(page, colaHuf)).toBeVisible();
  await expect(
    page.getByRole("radio", { name: checkout.tipNone }),
  ).toBeChecked();
  await page.getByText(fill(checkout.tipPercent, { percent: 10 })).click();

  await expect(payButton(page, colaHuf + 69)).toBeVisible();
  expect(tips).toEqual([0, 69]);
  const { violations } = await new AxeBuilder({ page })
    .exclude("nextjs-portal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("asks for 18+ and the terms, then a double tap makes one order and opens the live page", async ({
  page,
}) => {
  let created = 0;
  let sent: { acceptedTermsVersion?: string; smsRequested?: boolean } = {};
  await cartToCheckout(page, async () => {
    await answerQuote(page);
    await page.route("**/v1/orders", async (route) => {
      created++;
      sent = route.request().postDataJSON() as typeof sent;
      await json(route, 201, {
        data: { orderId, clientSecret: "pi_1_secret_x", guestToken },
      });
    });
  });
  const pay = payButton(page, colaHuf);
  await expect(pay).toBeEnabled();

  await pay.click();
  await expect(page.getByText(checkout.adultRequired)).toBeVisible();
  await expect(page.getByText(checkout.termsRequired)).toBeVisible();
  expect(created).toBe(0);

  await page.getByLabel(checkout.adult).check();
  await page.getByLabel(checkout.terms).check();
  await pay.dblclick();

  // The live page may compile on first use in dev.
  await expect(page).toHaveURL(new RegExp(`/hu/o/${orderId}$`), {
    timeout: 20_000,
  });
  expect(created).toBe(1);
  expect(sent).toMatchObject({
    acceptedTermsVersion: "draft-2026-11",
    smsRequested: false,
  });
});

test("takes only a Hungarian mobile number for the SMS", async ({ page }) => {
  let sent: { guestPhone?: string } = {};
  await cartToCheckout(page, async () => {
    await answerQuote(page);
    await page.route("**/v1/orders", async (route) => {
      sent = route.request().postDataJSON() as typeof sent;
      await json(route, 201, {
        data: { orderId, clientSecret: "pi_1_secret_x", guestToken },
      });
    });
  });
  await page.getByLabel(checkout.sms).check();
  await page.getByLabel(checkout.adult).check();
  await page.getByLabel(checkout.terms).check();

  await page.getByLabel(checkout.phone).fill("12 34");
  await payButton(page, colaHuf).click();
  await expect(page.getByText(checkout.phoneInvalid)).toBeVisible();

  await page.getByLabel(checkout.phone).fill("30 123 4567");
  await payButton(page, colaHuf).click();
  // The live page may compile on first use in dev.
  await expect(page).toHaveURL(new RegExp(`/hu/o/${orderId}$`), {
    timeout: 20_000,
  });
  expect(sent.guestPhone).toBe("+36301234567");
});

test("a paused bar disables the pay button and says why", async ({ page }) => {
  await cartToCheckout(page, () => answerQuote(page));
  setBarPaused(bar, true);
  try {
    await page.reload();

    await expect(
      page.getByText(messages.hu.apiErrors.bar_paused),
    ).toBeVisible();
    await expect(payButton(page, colaHuf)).toBeDisabled();
  } finally {
    setBarPaused(bar, false);
  }
});

test("an empty cart sends the guest back to the menu", async ({ page }) => {
  await page.goto(`/hu/v/demo/checkout?bar=${bar}&zone=${zone}`);

  await expect(page.getByText(checkout.empty)).toBeVisible();
  await expect(page.getByRole("link", { name: checkout.back })).toBeVisible();
});
