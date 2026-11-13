import AxeBuilder from "@axe-core/playwright";
import { messages } from "@namitiszunk/i18n";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-060: the Owner creates a code, sees it with its usage and stops it. A Manager's 403 is in
// shell.spec.ts; validation, reservation and release are core tests (packages/core/src/promos), and
// the checkout field is in apps/order/e2e/checkout.spec.ts.

const t = messages.hu.admin.promos;
// The dev server keeps its database between runs, so each run creates a new code.
const code = `E2E${Date.now() % 1_000_000}`;

test("an Owner creates a promo code, sees it in the list and stops it", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/promos", { timeout: 60_000 });
  // The seeded codes are listed with their state.
  await expect(
    page.getByRole("cell", { name: "DEMO10", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: t.add }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(t.code).fill(code.toLowerCase());
  await dialog.getByLabel(t.valuePercent).fill("20");
  await dialog.getByLabel(t.maxUses).fill("50");
  await dialog.getByRole("button", { name: t.create }).click();

  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: code });
  await expect(row).toContainText("20%");
  await expect(row).toContainText("0 / 50");
  await expect(row).toContainText(t.active);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  await row.getByRole("button", { name: `${t.stop} ${code}` }).click();
  await expect(row).toContainText(t.stopped);
  await expect(
    row.getByRole("button", { name: `${t.restart} ${code}` }),
  ).toBeVisible();
});

test("the same code in another case is refused on the field", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/promos", { timeout: 60_000 });

  await page.getByRole("button", { name: t.add }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(t.code).fill("demo10");
  await dialog.getByLabel(t.valuePercent).fill("5");
  await dialog.getByRole("button", { name: t.create }).click();

  await expect(
    dialog.getByText(messages.hu.validation.promoCode.taken),
  ).toBeVisible();
});
