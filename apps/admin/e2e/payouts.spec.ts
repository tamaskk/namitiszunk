import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-059: the seeded venue has no Stripe account, so the Owner sees the connect step. A Manager's 403
// on /payouts is in shell.spec.ts; the connected view (balance, payouts, disputes, export) is a core
// test with a mocked Stripe, and its match with the Stripe Dashboard a manual check in TASKS.md.

test("an Owner without a Stripe account is offered the connect step", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");

  // In CI the dev server compiles /payouts on the first visit.
  await page.goto("/payouts", { timeout: 60_000 });

  await expect(
    page.getByRole("heading", { name: "Kösd be a Stripe-fiókot" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stripe bekötése" }),
  ).toBeEnabled();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
});

test("the export link refuses an Owner without a Stripe account", async ({ context }) => {
  await signIn(context, "owner");

  const response = await context.request.get(
    "/payouts/export?from=2026-11-01&to=2026-11-07&format=csv",
  );

  expect(response.status()).toBe(409);
  expect(await response.text()).toBe("Előbb kösd be a Stripe-fiókot.");
});

test("the profile starts two-step sign-in with a QR code and backup codes", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/profile", { timeout: 60_000 });

  await page.getByRole("button", { name: "Bekapcsolás" }).click();

  await expect(
    page.getByRole("img", { name: "QR-kód a hitelesítő alkalmazásnak" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tartalék kódok" })).toBeVisible();
  await expect(page.getByLabel("Az alkalmazás 6 jegyű kódja")).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
});
