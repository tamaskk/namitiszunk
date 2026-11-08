import { createHash, randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { formatHuf, messages } from "@namitiszunk/i18n";
import { expect, type Page, type Route, test } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";

import { E2E_API_URL, E2E_MONGO_URI } from "./env";

// Guest pages after payment: confirmation (T-044), thanks and rating (T-045), problem report (T-046).
// The pages read MongoDB directly; their calls to apps/api are answered here with page.route.

const hu = messages.hu.order;
const wcagAA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function newToken() {
  const token = randomBytes(16).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

const pickedUp = { id: new ObjectId(), ...newToken() };
const preparing = { id: new ObjectId(), ...newToken() };
const refundHuf = 1000;

test.beforeAll(async () => {
  const client = await MongoClient.connect(E2E_MONGO_URI);
  const db = client.db();
  const venueId = new ObjectId();
  const barId = new ObjectId();
  const now = new Date();
  await db.collection("venues").insertOne({
    _id: venueId,
    slug: `e2e-${venueId.toHexString()}`,
    name: "Pilot Club",
    company: { name: "Pilot Kft.", taxNumber: "12345678-2-42" },
    address: { street: "Király u. 1.", city: "Budapest", postalCode: "1061" },
  });
  await db
    .collection("bars")
    .insertOne({ _id: barId, venueId, name: "Főpult" });
  const order = (o: typeof pickedUp, status: string, shortNumber: number) => ({
    _id: o.id,
    venueId,
    barId,
    shortNumber,
    businessDate: "2026-11-07",
    status,
    isVip: false,
    items: [
      {
        itemId: new ObjectId(),
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
  await db
    .collection("orders")
    .insertMany([
      order(pickedUp, "picked_up", 214),
      order(preparing, "preparing", 215),
    ]);
  await db.collection("payments").insertOne({
    orderId: pickedUp.id,
    stripePaymentIntentId: `pi_e2e_${pickedUp.id.toHexString()}`,
    status: "succeeded",
    amountHuf: 4980,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  await db.collection("refunds").insertOne({
    orderId: pickedUp.id,
    status: "succeeded",
    amountHuf: refundHuf,
    createdAt: now,
    updatedAt: now,
  });
  await client.close();
});

/** Answers one apps/api endpoint, CORS preflight included (the guest token is a custom header). */
async function answerApi(
  page: Page,
  path: string,
  status: number,
  data: unknown,
) {
  await page.route(`${E2E_API_URL}${path}`, (route: Route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-guest-token, accept",
      "access-control-allow-methods": "POST, OPTIONS",
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
  const path = `/hu/r/${pickedUp.id.toHexString()}`;

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

    await answerApi(
      page,
      `/v1/orders/${pickedUp.id.toHexString()}/confirmation-email`,
      200,
      { sent: true },
    );
    await send.click();
    await expect(page.getByText(hu.confirmation.email.sent)).toBeVisible();

    await page.unrouteAll();
    await answerApi(
      page,
      `/v1/orders/${pickedUp.id.toHexString()}/confirmation-email`,
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
    await page.goto(`/hu/r/${pickedUp.id.toHexString()}?t=${pickedUp.token}`);
    await answerApi(
      page,
      `/v1/orders/${pickedUp.id.toHexString()}/report`,
      200,
      { reported: true },
    );
    await page.getByRole("button", { name: hu.report.button }).click();
    const send = page.getByRole("button", { name: hu.report.send });

    await send.click();
    await expect(page.getByText(hu.report.categoryRequired)).toBeVisible();

    await page.getByLabel(hu.report.categories.not_received).check();
    await send.click();
    await expect(page.getByText(hu.report.sent)).toBeFocused();
  });

  test("says when the fourth report is refused", async ({ page }) => {
    await page.goto(`/hu/r/${pickedUp.id.toHexString()}?t=${pickedUp.token}`);
    await answerApi(
      page,
      `/v1/orders/${pickedUp.id.toHexString()}/report`,
      429,
      null,
    );
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
    await page.goto(
      `/hu/o/${pickedUp.id.toHexString()}/thanks?t=${pickedUp.token}`,
    );
    await answerApi(
      page,
      `/v1/orders/${pickedUp.id.toHexString()}/review`,
      200,
      { reviewed: true },
    );
    const send = page.getByRole("button", { name: hu.thanks.send });
    await expectNoViolations(page);

    await send.click();
    await expect(page.getByText(hu.thanks.chooseStars)).toBeVisible();

    await page.getByLabel("4 csillag").check({ force: true });
    await page.getByLabel(hu.thanks.text).fill("Gyors volt");
    await send.click();
    await expect(page.getByText(hu.thanks.sent)).toBeFocused();
  });

  test("sends an order that is not picked up yet back to the live page", async ({
    page,
  }) => {
    const id = preparing.id.toHexString();

    await page.goto(`/hu/o/${id}/thanks?t=${preparing.token}`);

    await expect(page).toHaveURL(new RegExp(`/hu/o/${id}$`));
  });
});
