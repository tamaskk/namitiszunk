import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-056: a manager finds an order by its number, opens it, starts a partial refund with a
// reason, and downloads the export. The refund itself runs on apps/api (/v1), answered here with
// page.route; refundOrder and its audit entries are covered by packages/core tests.
// The seed's Picked up order is #5 of today's business day.

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context, "manager");
  // In CI the dev server compiles /orders on the first visit.
  await page.goto("/orders", { timeout: 60_000 });
});

test("finds #5 on today's business day and refunds part of it with a reason", async ({
  page,
}) => {
  await page.getByLabel("Rendelésszám").fill("#5");
  await page.getByRole("button", { name: "Szűrés" }).click();

  await expect(page).toHaveURL(/number=%235|number=#5/);
  const list = page.getByRole("region", { name: /rendelés$/ });
  await expect(list.getByRole("link")).toHaveCount(1);
  const a11yList = await new AxeBuilder({ page }).analyze();
  expect(a11yList.violations).toEqual([]);

  await list.getByRole("link", { name: /5\. rendelés/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "5. rendelés" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Átvéve").first()).toBeVisible();
  const a11yDetail = await new AxeBuilder({ page }).analyze();
  expect(a11yDetail.violations).toEqual([]);

  let sent: unknown;
  await page.route("**/v1/orders/*/refunds", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          refundId: "6650aa0000000000000000d1",
          amountHuf: 500,
          status: "pending",
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Visszatérítés" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Részösszeg").check();
  await dialog.getByLabel("Összeg (Ft)").fill("500");
  const confirm = dialog.getByRole("button", {
    name: "Visszatérítés indítása",
  });
  // No reason, no refund.
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Ok", { exact: true }).fill("Rossz ital");
  await confirm.click();

  await expect(page.getByText("A visszatérítés elindult.")).toBeVisible();
  expect(sent).toEqual({ amountHuf: 500, reason: "Rossz ital" });
});

test("filters orders without a receipt and downloads the export", async ({
  page,
}) => {
  const day = await page.getByLabel("Üzleti nap", { exact: true }).inputValue();
  await page.getByLabel("Nyugta beütve hiányzik").check();
  await page.getByRole("button", { name: "Szűrés" }).click();
  await expect(page).toHaveURL(/receipt=missing/);

  const csv = await page.request.get(
    `/orders/export?from=${day}&to=${day}&format=csv`,
  );
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Rendelésszám");
  expect(text).toContain("Átvéve");
  expect(text).not.toMatch(/\+36/);

  const xlsx = await page.request.get(
    `/orders/export?from=${day}&to=${day}&format=xlsx`,
  );
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});
