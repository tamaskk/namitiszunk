import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-061 on the Demo Klub seed: today's business day has 8 paid orders (#2–#5, #7–#10; #1 awaits
// payment and #6 was cancelled before paying). Bartender figures from the seeded audit log:
// Bence marked #4 Ready (400 Ft tip), Dóra marked #5 and #8 Ready. Exact forints, medians and
// business-day boundaries are covered by packages/core/src/reports/reports.test.ts.

test.describe.configure({ mode: "serial" });

test("a Manager sees only the daily report and can export it", async ({
  context,
  page,
}) => {
  await signIn(context, "manager");

  // In CI the dev server compiles /reports on the first visit.
  await page.goto("/reports", { timeout: 60_000 });

  await expect(
    page.getByRole("heading", { level: 1, name: "Riportok" }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Összesítés" });
  await expect(summary.getByRole("definition").first()).toHaveText("8");
  await expect(
    page.getByRole("region", { name: "Top termékek" }),
  ).toBeVisible();
  // No view links: the period and bartender reports are the Owner's.
  await expect(
    page.getByRole("navigation", { name: "Riportnézetek" }),
  ).toHaveCount(0);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  const day = await page.getByLabel("Üzleti nap", { exact: true }).inputValue();
  const csv = await page.request.get(
    `/reports/export/daily?from=${day}&to=${day}&format=csv`,
  );
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Bevétel borravaló nélkül (Ft)");
  expect(text).toContain(`${day};8;`);

  const refused = await page.request.get(
    `/reports/export/period?from=${day}&to=${day}&format=csv`,
  );
  expect(refused.status()).toBe(403);
  const period = await page.goto("/reports/period");
  expect(period?.status()).toBe(403);
});

test("an Owner filters the period, compares it and downloads the Excel", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/reports", { timeout: 60_000 });
  const day = await page.getByLabel("Üzleti nap", { exact: true }).inputValue();

  await page
    .getByRole("navigation", { name: "Riportnézetek" })
    .getByRole("link", { name: "Időszak" })
    .click();
  // The daily export has the same field names: wait for the period filters.
  await expect(page.getByLabel("Összevetés ettől")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Ettől (üzleti nap)").first().fill(day);
  await page.getByLabel("Eddig (üzleti nap)").first().fill(day);
  await page.getByLabel("Összevetés ettől").fill("2026-01-01");
  await page.getByLabel("Összevetés eddig").fill("2026-01-07");
  await page.getByRole("button", { name: "Mutasd" }).click();

  await expect(page).toHaveURL(/cfrom=2026-01-01/);
  await expect(
    page.getByRole("heading", { name: "Összehasonlítás" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Csúcsórák" })).toBeVisible();
  // Every seeded order came from its zone's QR code.
  const qr = page.getByRole("region", { name: "QR-forrás szerint" });
  await expect(qr.getByText(/\(demo-/).first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel letöltése" }).click();
  expect((await download).suggestedFilename()).toBe(
    `idoszak-riport-${day}_${day}.xlsx`,
  );
});

test("an Owner checks the bartender report against the seed", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/reports/staff", { timeout: 60_000 });

  await expect(page.getByRole("note")).toContainText(
    "A borravaló szétosztása a klub feladata.",
  );
  const table = page.getByRole("region", { name: "Pultosok" });
  await expect(table.getByRole("row")).toHaveCount(3);
  const dora = table.getByRole("row", { name: /Dóra/ });
  await expect(dora.getByRole("cell").nth(1)).toHaveText("2");
  await expect(dora.getByRole("cell").nth(3)).toHaveText("3:00 perc");
  const bence = table.getByRole("row", { name: /Bence/ });
  await expect(bence.getByRole("cell").nth(1)).toHaveText("1");
  await expect(bence.getByRole("cell").nth(4)).toHaveText(/400\s*Ft/);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
});
