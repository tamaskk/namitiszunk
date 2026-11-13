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
const { checkout } = messages.hu.order;
type Locale = "hu" | "en";
/** The fixed part of a message before its first placeholder, as a "starts with" pattern. */
const startsWith = (template: string) =>
  new RegExp(
    `^${template.split("{")[0]!.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}`,
  );
const bar = seedId("bar:main");
const zone = seedId("zone:dancefloor");
const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const guestToken = "g".repeat(22);
const colaHuf = 690;

/**
 * A Payment Element that is ready at once and pays every card. `__stripeFails` (set by an earlier
 * init script) makes it fail to load ("load") or decline with no message ("confirm").
 */
function fakeStripe() {
  const calls: string[] = [];
  const fails = (window as unknown as { __stripeFails?: string }).__stripeFails;
  (window as unknown as { __stripeCalls: string[] }).__stripeCalls = calls;
  (window as unknown as { Stripe: unknown }).Stripe = () => ({
    elements: () => ({
      create: () => ({
        on: (event: string, handler: () => void) => {
          if (event === (fails === "load" ? "loaderror" : "ready"))
            setTimeout(handler, 0);
        },
        mount: () => calls.push("mount"),
        destroy: () => {},
      }),
      update: () => calls.push("update"),
      submit: async () => ({}),
    }),
    confirmPayment: async () => {
      calls.push("confirm");
      return fails === "confirm"
        ? { error: {} }
        : { paymentIntent: { status: "succeeded" } };
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
async function answerQuote(page: Page, tips: number[] = [], delayMs = 0) {
  await page.route("**/v1/orders/quote", async (route) => {
    if (tips.length > 0 && delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
async function cartToCheckout(
  page: Page,
  answer: () => Promise<void>,
  stripeFails?: "load" | "confirm",
  locale: Locale = "hu",
) {
  const { menu, product, cart, checkout } = messages[locale].order;
  if (stripeFails)
    await page.addInitScript((fails) => {
      (window as unknown as { __stripeFails: string }).__stripeFails = fails;
    }, stripeFails);
  await page.addInitScript(fakeStripe);
  // The Next.js dev badge sits over the fixed pay bar in dev; it never ships to production.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  await page.goto(`/${locale}/v/demo?bar=${bar}&zone=${zone}`);
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
    .getByRole("button", { name: startsWith(product.toCart) })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: startsWith(cart.open) }).click();
  await answer();
  await page.getByRole("button", { name: cart.continue }).click();
  await expect(
    page.getByRole("heading", { name: checkout.title, exact: true }),
  ).toBeVisible();
}

const payButton = (page: Page, totalHuf: number, locale: Locale = "hu") =>
  page.getByRole("button", {
    name: fill(messages[locale].order.checkout.pay, {
      total: formatHuf(totalHuf),
    }),
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

// T-048 cases 9 (double tap) and, below, 4 (failed payment) run in both languages.
for (const locale of ["hu", "en"] as const) {
  test(`asks for 18+ and the terms, then a double tap makes one order and opens the live page (${locale})`, async ({
    page,
  }) => {
    let created = 0;
    let sent: { acceptedTermsVersion?: string; smsRequested?: boolean } = {};
    await cartToCheckout(
      page,
      async () => {
        await answerQuote(page);
        await page.route("**/v1/orders", async (route) => {
          created++;
          sent = route.request().postDataJSON() as typeof sent;
          await json(route, 201, {
            data: { orderId, clientSecret: "pi_1_secret_x", guestToken },
          });
        });
      },
      undefined,
      locale,
    );
    const { checkout } = messages[locale].order;
    const pay = payButton(page, colaHuf, locale);
    await expect(pay).toBeEnabled();

    await pay.click();
    await expect(page.getByText(checkout.adultRequired)).toBeVisible();
    await expect(page.getByText(checkout.termsRequired)).toBeVisible();
    expect(created).toBe(0);

    // T-003: the terms box links the published terms in the guest's language, in a new tab,
    // and following the link does not tick the box.
    const termsLink = page.locator("label[for=checkout-terms] a");
    await expect(termsLink).toHaveAttribute(
      "href",
      `https://namitiszunk.hu/${locale}/aszf`,
    );
    await page
      .context()
      .route("https://namitiszunk.hu/**", (route) =>
        route.fulfill({ body: "" }),
      );
    const [terms] = await Promise.all([
      page.waitForEvent("popup"),
      termsLink.click(),
    ]);
    await terms.close();
    await expect(page.locator("#checkout-terms")).not.toBeChecked();
    await page.getByLabel(checkout.adult).check();
    await page.locator("#checkout-terms").check();
    await pay.dblclick();

    // The live page may compile on first use in dev.
    await expect(page).toHaveURL(new RegExp(`/${locale}/o/${orderId}$`), {
      timeout: 20_000,
    });
    expect(created).toBe(1);
    expect(sent).toMatchObject({
      acceptedTermsVersion: "draft-2026-11",
      smsRequested: false,
    });
  });
}

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
  await page.locator("#checkout-terms").check();

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

test("a paused bar disables the pay button and says why, and Pay comes back when the pause ends", async ({
  page,
}) => {
  await cartToCheckout(page, () => answerQuote(page));
  setBarPaused(bar, true, 8_000);
  try {
    await page.reload();

    await expect(
      page.getByText(messages.hu.apiErrors.bar_paused),
    ).toBeVisible();
    await expect(payButton(page, colaHuf)).toBeDisabled();
    // T-048: no reload; the cart stayed, the status and the price come back by themselves.
    await expect(payButton(page, colaHuf)).toBeEnabled({ timeout: 20_000 });
  } finally {
    setBarPaused(bar, false);
  }
});

test("an empty cart sends the guest back to the menu", async ({ page }) => {
  await page.goto(`/hu/v/demo/checkout?bar=${bar}&zone=${zone}`);

  await expect(page.getByText(checkout.empty)).toBeVisible();
  await expect(page.getByRole("link", { name: checkout.back })).toBeVisible();
});

test("keeps Pay disabled until the new tip is priced", async ({ page }) => {
  const tips: number[] = [];
  await cartToCheckout(page, () => answerQuote(page, tips, 1500));
  await expect(payButton(page, colaHuf)).toBeEnabled();

  await page.getByText(fill(checkout.tipPercent, { percent: 10 })).click();

  // The old total is still on the button, but it cannot be paid any more.
  await expect(payButton(page, colaHuf)).toBeDisabled();
  await expect(payButton(page, colaHuf + 69)).toBeEnabled();
});

test("says the payment form did not load and offers a retry", async ({
  page,
}) => {
  await cartToCheckout(page, () => answerQuote(page), "load");

  await expect(page.getByText(checkout.paymentLoadFailed)).toBeVisible();
  await expect(
    page.getByRole("button", { name: checkout.retry, exact: true }),
  ).toBeVisible();
  await expect(payButton(page, colaHuf)).toBeDisabled();
});

for (const locale of ["hu", "en"] as const) {
  test(`a declined payment without a message stays on the checkout, keeps the cart and offers another method (${locale})`, async ({
    page,
  }) => {
    await cartToCheckout(
      page,
      async () => {
        await answerQuote(page);
        await page.route("**/v1/orders", (route) =>
          json(route, 201, {
            data: { orderId, clientSecret: "pi_1_secret_x", guestToken },
          }),
        );
      },
      "confirm",
      locale,
    );
    const { checkout } = messages[locale].order;
    await page.getByLabel(checkout.adult).check();
    await page.locator("#checkout-terms").check();

    await payButton(page, colaHuf, locale).click();

    await expect(page.getByText(checkout.payFailed)).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
    await page.getByRole("button", { name: checkout.otherMethod }).click();
    await expect(
      page.getByRole("heading", { name: checkout.payment }),
    ).toBeFocused();
    await expect(payButton(page, colaHuf, locale)).toBeEnabled();
  });
}

test("applies a promo code through the server quote, and shows why a code is refused (T-060)", async ({
  page,
}) => {
  const discountHuf = 69;
  const codes: (string | undefined)[] = [];
  await cartToCheckout(page, async () => {
    await page.route("**/v1/orders/quote", async (route) => {
      const { promoCode } = route.request().postDataJSON() as {
        promoCode?: string;
      };
      codes.push(promoCode);
      if (promoCode === "LEJART")
        return json(route, 409, {
          error: {
            code: "promo_expired",
            messageKey: "apiErrors.promo_expired",
          },
        });
      const discount = promoCode ? discountHuf : 0;
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
          discountHuf: discount,
          serviceFeeHuf: 0,
          tipHuf: 0,
          totalHuf: colaHuf - discount,
          stripeAccountId: "acct_1Demo",
          termsVersion: "draft-2026-11",
        },
      });
    });
  });
  const field = page.getByLabel(checkout.promo, { exact: true });

  await field.fill("LEJART");
  await page.getByRole("button", { name: checkout.promoApply }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages.hu.apiErrors.promo_expired }),
  ).toBeVisible();
  await expect(payButton(page, colaHuf)).toBeVisible();
  await expect(field).toBeFocused();
  await field.fill("no spaces");
  await field.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: messages.hu.apiErrors.promo_invalid }),
  ).toBeVisible();
  await field.fill("demo10");
  await field.press("Enter");

  const remove = page.getByRole("button", { name: checkout.promoRemove });
  await expect(remove).toBeFocused();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: fill(checkout.promoApplied, { code: "DEMO10" }) }),
  ).toBeVisible();
  await expect(
    page.getByText(fill(checkout.discountCode, { code: "DEMO10" })),
  ).toBeVisible();
  await expect(payButton(page, colaHuf - discountHuf)).toBeVisible();
  expect(codes).toContain("demo10");
  expect(codes).not.toContain("no spaces");
  await remove.click();
  await expect(field).toBeFocused();
  await expect(payButton(page, colaHuf)).toBeVisible();
});
