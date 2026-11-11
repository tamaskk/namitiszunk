import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page, test } from "@playwright/test";

import { signIn } from "./db";

// T-055: a manager sets up a phone on /vip, the VIP host signs in with name + PIN (seed: Lili,
// 4005) and hands a Ready bottle over. The /v1 calls are answered with page.route, as in
// bar-view.spec.ts; without an Ably token the list polls.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

const readyId = "6650aa0000000000000000c1";
const comingId = "6650aa0000000000000000c2";

async function setUpPhone(context: BrowserContext, page: Page, pin: string) {
  await signIn(context, "owner");
  await page.goto("/vip", { timeout: 60_000 });
  await page
    .getByRole("button", { name: "Telefon beállítása VIP-hostnak" })
    .click();
  await expect(page).toHaveURL(/\/pin$/, { timeout: 30_000 });
  await page
    .getByRole("button", { name: pin === "4005" ? "Lili" : "Bence" })
    .click();
  for (const digit of pin)
    await page.getByRole("button", { name: digit, exact: true }).click();
}

async function mockVipApi(page: Page) {
  const state = { handedOver: false };
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const order = (id: string, shortNumber: number, status: string) => ({
    id,
    shortNumber,
    status,
    version: 1,
    tableName: shortNumber === 7 ? "VIP 3" : "VIP 5",
    barName: "Főpult",
    items: [{ name: "Moët", quantity: 1, options: ["0,75 l"] }],
    paidAt: new Date().toISOString(),
    readyAt: status === "ready" ? new Date().toISOString() : null,
  });
  await page.route("**/v1/realtime/token", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.route("**/v1/venues/*/vip-orders", (route) =>
    route.fulfill(
      json({
        staffName: "Lili",
        orders: [
          ...(state.handedOver ? [] : [order(readyId, 7, "ready")]),
          order(comingId, 8, "preparing"),
        ],
      }),
    ),
  );
  await page.route(`**/v1/orders/${readyId}/status`, async (route) => {
    const { event } = route.request().postDataJSON() as { event: string };
    expect(event).toBe("pick_up");
    state.handedOver = true;
    await route.fulfill(json({ ok: true }));
  });
}

test("the VIP host takes a Ready order out and marks it handed over", async ({
  context,
  page,
}) => {
  await mockVipApi(page);
  await setUpPhone(context, page, "4005");
  await expect(page).toHaveURL(/\/vip$/, { timeout: 30_000 });

  const takeOut = page.getByRole("region", { name: /^Kivinni/ });
  const coming = page.getByRole("region", { name: /^Készül/ });
  const card = takeOut.getByRole("article", { name: "VIP 3, 7. rendelés" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("VIP 3")).toBeVisible();
  await expect(
    coming.getByRole("article", { name: "VIP 5, 8. rendelés" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kilépés (Lili)" }),
  ).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  // Offline: a red bar, the list stays, the button is off.
  await context.setOffline(true);
  const banner = page.getByRole("alert").filter({ hasText: "Nincs kapcsolat" });
  await expect(banner).toBeVisible();
  await expect(card.getByRole("button", { name: "Átadva" })).toBeDisabled();
  await context.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 15_000 });

  await card.getByRole("button", { name: "Átadva" }).click();
  await expect(card).toHaveCount(0);
  await expect(takeOut.getByText("Most nincs kivinnivaló.")).toBeVisible();
});

test("a bartender PIN cannot open the VIP view", async ({ context, page }) => {
  await setUpPhone(context, page, "3003");
  await expect(page).not.toHaveURL(/\/pin$/, { timeout: 30_000 });
  await page.goto("/vip");
  await expect(
    page.getByRole("heading", { name: "Ehhez nincs jogosultságod" }),
  ).toBeVisible();
});
