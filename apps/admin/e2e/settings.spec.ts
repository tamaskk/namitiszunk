import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-058: the Owner saves a fixed service fee and the opening hours, and a low-contrast accent warns.
// A Manager's 403 on /settings is in shell.spec.ts; the checkout total with the fee is a core test
// (calculate-order and settings), the order app's closed state at 04:45 an opening-hours test.

test.describe.configure({ mode: "serial" });

test("the Owner saves a fixed service fee and gets it back after a reload", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  // In CI the dev server compiles /settings on the first visit.
  await page.goto("/settings?tab=order", { timeout: 60_000 });

  await page.getByRole("combobox", { name: "Szervizdíj típusa" }).click();
  await page.getByRole("option", { name: "Fix összeg" }).click();
  await page.getByLabel("Szervizdíj (Ft)").fill("300");
  await page.getByRole("button", { name: "Mentés" }).click();
  // The first save compiles the server action in CI.
  await expect(page.getByText("Mentve.")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.getByLabel("Szervizdíj (Ft)")).toHaveValue("300");
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  // Back to no fee, so other specs price as before.
  await page.getByRole("combobox", { name: "Szervizdíj típusa" }).click();
  await page.getByRole("option", { name: "Nincs" }).click();
  await page.getByRole("button", { name: "Mentés" }).click();
  await expect(page.getByText("Mentve.")).toBeVisible();
});

test("a closing time equal to the opening is refused on the field", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/settings?tab=hours", { timeout: 60_000 });

  const friday = page.getByRole("listitem").filter({ hasText: "Péntek" });
  const fridayBox = friday.getByRole("checkbox", { name: "Péntek" });
  if (!(await fridayBox.isChecked())) await fridayBox.check();
  await friday.getByLabel("Nyitás").fill("22:00");
  await friday.getByLabel("Zárás").fill("22:00");
  await page.getByRole("button", { name: "Mentés" }).click();

  await expect(
    friday.getByText("A zárás nem lehet ugyanakkor, mint a nyitás."),
  ).toBeVisible();
});

test("a dark accent warns that the order page keeps the default colour", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/settings?tab=branding", { timeout: 60_000 });

  await page.getByLabel("Kiemelő szín").fill("#1e3a8a");

  const warning = page.getByText(
    /a rendelős oldal addig az alap színt mutatja/,
  );
  await expect(warning).toBeVisible();
  await page.getByLabel("Kiemelő szín").fill("#c8ff2e");
  await expect(warning).toHaveCount(0);
});
