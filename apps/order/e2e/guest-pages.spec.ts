import { createHash, randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { formatHuf, messages } from "@namitiszunk/i18n";
import { expect, type Page, type Route, test } from "@playwright/test";
import { upsertDocument } from "./db";

// Guest pages after payment: confirmation (T-044), thanks and rating (T-045), problem report (T-046).
// The pages read the e2e database (seeded here through db.ts); their apps/api calls are answered with page.route.

const hu = messages.hu.order;
const wcagAA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const newId = () => randomBytes(12).toString("hex");
const oid = (hex: string) => ({ $oid: hex });

function newToken() {
  const token = randomBytes(16).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

const pickedUp = { id: newId(), ...newToken() };
const preparing = { id: newId(), ...newToken() };
const refundHuf = 1000;
const venueId = newId();
const barId = newId();
const menuUrl = `/hu/v/e2e-${venueId}?bar=${barId}`;

test.beforeAll(() => {
  const now = { $date: new Date().toISOString() };
  upsertDocument("venues", {
    _id: oid(venueId),
    slug: `e2e-${venueId}`,
    name: "Pilot Club",
    company: { name: "Pilot Kft.", taxNumber: "12345678-2-42" },
    address: { street: "Király u. 1.", city: "Budapest", postalCode: "1061" },
  });
  upsertDocument("bars", {
    _id: oid(barId),
    venueId: oid(venueId),
    name: "Főpult",
  });
  for (const [o, status, shortNumber] of [
    [pickedUp, "picked_up", 214],
    [preparing, "preparing", 215],
  ] as const)
    upsertDocument("orders", {
      _id: oid(o.id),
      venueId: oid(venueId),
      barId: oid(barId),
      shortNumber,
      businessDate: "2026-11-07",
      status,
      isVip: false,
      items: [
        {
          itemId: oid(newId()),
          name: "Gin tonic",
          nameEn: "Gin and tonic",
          unitPriceHuf: 2490,
          quantity: 2,
          options: [],
          lineTotalHuf: 4980,
        },
      ],
      subtotalHuf: 4980,
      discountHuf: 0,
      serviceFeeHuf: 0,
      tipHuf: 0,
      totalHuf: 4980,
      pickupCode: "K7Q",
      guestTokenHash: o.hash,
      acceptedTermsVersion: "2026-11-01",
      paidAt: now,
      problemReports: [],
      confirmationEmailCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  upsertDocument("payments", {
    _id: oid(newId()),
    orderId: oid(pickedUp.id),
    stripePaymentIntentId: `pi_e2e_${pickedUp.id}`,
    status: "succeeded",
    amountHuf: 4980,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  upsertDocument("refunds", {
    _id: oid(newId()),
    orderId: oid(pickedUp.id),
    status: "succeeded",
    amountHuf: refundHuf,
    createdAt: now,
    updatedAt: now,
  });
});

/** Answers one apps/api endpoint, CORS preflight included (the guest token is a custom header). */
async function answerApi(
  page: Page,
  path: string,
  status: number,
  data: unknown,
) {
  await page.route(`**${path}`, (route: Route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-guest-token, accept",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(
        status < 400 ? { data } : { error: { code: "x", messageKey: "x" } },
      ),
    });
  });
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .exclude("nextjs-portal")
    .withTags(wcagAA)
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`),
  ).toEqual([]);
}

test.describe("payment confirmation (T-044)", () => {
  const path = `/hu/r/${pickedUp.id}`;

  test("moves the token into a cookie and opens with the not-a-receipt line", async ({
    page,
  }) => {
    await page.goto(`${path}?t=${pickedUp.token}`);

    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator("main > *").first()).toHaveText(
      hu.confirmation.notReceipt,
    );
    await expect(
      page.getByText(formatHuf(refundHuf), { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(/ÁFA|VAT/)).toHaveCount(0);
    await expectNoViolations(page);
  });

  test("prints with the not-a-receipt line first and without the actions", async ({
    page,
  }) => {
    await page.goto(`${path}?t=${pickedUp.token}`);

    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A4" });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(page.locator("main > *").first()).toHaveText(
      hu.confirmation.notReceipt,
    );
    await expect(
      page.getByRole("button", { name: hu.confirmation.print }),
    ).toBeHidden();
  });

  test("answers 404 without the token", async ({ page }) => {
    await page.goto(path);

    await expect(
      page.getByText(messages.hu.common.notFound.message),
    ).toBeVisible();
  });

  test("e-mails the confirmation, and says when the limit is reached", async ({
    page,
  }) => {
    await page.goto(`${path}?t=${pickedUp.token}`);
    const send = page.getByRole("button", { name: hu.confirmation.email.send });
    await page
      .getByLabel(hu.confirmation.email.label)
      .fill("vendeg@example.com");

    await answerApi(page, `/v1/orders/${pickedUp.id}/confirmation-email`, 200, {
      sent: true,
    });
    await send.click();
    await expect(page.getByText(hu.confirmation.email.sent)).toBeVisible();

    await page.unrouteAll();
    await answerApi(
      page,
      `/v1/orders/${pickedUp.id}/confirmation-email`,
      429,
      null,
    );
    await send.click();
    await expect(page.getByText(hu.confirmation.email.limit)).toBeVisible();
  });
});

test.describe("problem report (T-046)", () => {
  test("needs a category, then reports and moves focus to the result", async ({
    page,
  }) => {
    await page.goto(`/hu/r/${pickedUp.id}?t=${pickedUp.token}`);
    await answerApi(page, `/v1/orders/${pickedUp.id}/report`, 200, {
      reported: true,
    });
    await page.getByRole("button", { name: hu.report.button }).click();
    const send = page.getByRole("button", { name: hu.report.send });

    await send.click();
    await expect(page.getByText(hu.report.categoryRequired)).toBeVisible();

    await page.getByLabel(hu.report.categories.not_received).check();
    await send.click();
    await expect(page.getByText(hu.report.sent)).toBeFocused();
  });

  test("says when the fourth report is refused", async ({ page }) => {
    await page.goto(`/hu/r/${pickedUp.id}?t=${pickedUp.token}`);
    await answerApi(page, `/v1/orders/${pickedUp.id}/report`, 429, null);
    await page.getByRole("button", { name: hu.report.button }).click();

    await page.getByLabel(hu.report.categories.other).check();
    await page.getByRole("button", { name: hu.report.send }).click();

    await expect(page.getByText(hu.report.limit)).toBeVisible();
  });
});

test.describe("thanks and rating (T-045)", () => {
  test("rates a picked-up order once the guest picks the stars", async ({
    page,
  }) => {
    await page.goto(`/hu/o/${pickedUp.id}/thanks?t=${pickedUp.token}`);
    await answerApi(page, `/v1/orders/${pickedUp.id}/review`, 200, {
      reviewed: true,
    });
    const send = page.getByRole("button", { name: hu.thanks.send });
    await expectNoViolations(page);

    await send.click();
    await expect(page.getByText(hu.thanks.chooseStars)).toBeVisible();

    await page.getByLabel("4 csillag").check({ force: true });
    await page.getByLabel(hu.thanks.text).fill("Gyors volt");
    await send.click();
    await expect(page.getByText(hu.thanks.sent)).toBeFocused();
  });

  test("links back to the same bar's menu for another round", async ({
    page,
  }) => {
    await page.goto(`/hu/o/${pickedUp.id}/thanks?t=${pickedUp.token}`);

    await expect(
      page.getByRole("link", { name: hu.thanks.orderMore }),
    ).toHaveAttribute("href", menuUrl);
  });

  test("orders again: fills the cart and names the items left out", async ({
    page,
  }) => {
    await page.goto(`/hu/o/${pickedUp.id}/thanks?t=${pickedUp.token}`);
    await answerApi(page, `/v1/orders/${pickedUp.id}/reorder`, 200, {
      venueId,
      venueSlug: `e2e-${venueId}`,
      barId,
      lines: [
        {
          itemId: newId(),
          name: "Gin tonic",
          unitPriceHuf: 2490,
          quantity: 2,
          modifierIds: [],
          options: [],
        },
      ],
      skipped: ["Coca-Cola"],
    });

    await page.getByRole("button", { name: hu.reorder.again }).click();

    await expect(
      page.getByRole("status").filter({
        hasText: hu.reorder.skipped.replace("{items}", "Coca-Cola"),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: hu.reorder.toMenu }),
    ).toHaveAttribute("href", menuUrl);
    const cart = await page.evaluate(
      (key) => localStorage.getItem(key),
      `namitiszunk:cart:${venueId}`,
    );
    expect(JSON.parse(cart ?? "[]")).toEqual([
      expect.objectContaining({ name: "Gin tonic", quantity: 2 }),
    ]);
  });

  test("says when ordering again failed", async ({ page }) => {
    await page.goto(`/hu/o/${pickedUp.id}/thanks?t=${pickedUp.token}`);
    await answerApi(page, `/v1/orders/${pickedUp.id}/reorder`, 404, null);

    await page.getByRole("button", { name: hu.reorder.again }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: hu.reorder.failed }),
    ).toBeVisible();
  });

  test("sends an order that is not picked up yet back to the live page", async ({
    page,
  }) => {
    const id = preparing.id;

    await page.goto(`/hu/o/${id}/thanks?t=${preparing.token}`);

    await expect(page).toHaveURL(new RegExp(`/hu/o/${id}$`));
  });
});

// Signed-in views need a signed Better Auth cookie: they are checked by hand (docs/fejlesztesi-terv.md §47).
test.describe("guest account sign-in (T-047)", () => {
  test("sends a sign-in link and says where it went", async ({ page }) => {
    await page.goto("/hu/fiok");
    await answerApi(page, "/api/auth/sign-in/magic-link", 200, null);
    await expectNoViolations(page);

    await page.getByLabel(hu.account.emailLabel).fill("vendeg@example.com");
    await page.getByRole("button", { name: hu.account.sendLink }).click();

    await expect(
      page.getByRole("status").filter({
        hasText: hu.account.linkSent.replace("{email}", "vendeg@example.com"),
      }),
    ).toBeVisible();
  });

  test("says the account is gone after deletion and keeps focus there", async ({
    page,
  }) => {
    await page.goto("/hu/fiok?notice=deleted");

    await expect(page.getByText(hu.account.notice.deleted)).toBeFocused();
  });

  test("lets the guest fix the address after the link went out", async ({
    page,
  }) => {
    await page.goto("/hu/fiok");
    await answerApi(page, "/api/auth/sign-in/magic-link", 200, null);
    await page.getByLabel(hu.account.emailLabel).fill("rossz@example.com");
    await page.getByRole("button", { name: hu.account.sendLink }).click();

    await page.getByRole("button", { name: hu.account.otherAddress }).click();

    await expect(page.getByLabel(hu.account.emailLabel)).toHaveValue(
      "rossz@example.com",
    );
  });

  test("points to the e-mail link when a social sign-in cannot start", async ({
    page,
  }) => {
    await page.goto("/hu/fiok");
    await answerApi(page, "/api/auth/sign-in/social", 404, null);

    await page.getByRole("button", { name: hu.account.google }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: hu.account.socialFailed }),
    ).toBeVisible();
  });
});
