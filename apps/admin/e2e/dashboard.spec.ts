import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { deleteOrder, insertNewOrder, signIn } from "./db";

// T-063 on the Demo Klub seed, on a phone. Without an Ably token the page polls every 5 s, the
// path a lost connection takes; the bar channel refresh itself is the same router.refresh().
// Figures and their match with the daily report are covered by packages/core/src/reports/dashboard.test.ts.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

test("a Manager sees a new order, pauses a bar and marks a product sold out", async ({
  context,
  page,
}) => {
  await signIn(context, "manager");
  await page.route("**/v1/realtime/token", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  const paused: unknown[] = [];
  await page.route("**/v1/bars/*/pause", async (route) => {
    paused.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { pausedUntil: null } }),
    });
  });

  // In CI the dev server compiles / on the first visit.
  await page.goto("/", { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Irányítópult" }),
  ).toBeVisible();
  const orders = page
    .getByRole("region", { name: "Összesítés" })
    .getByRole("definition")
    .first();
  const before = Number(await orders.textContent());
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
  // Every card and quick action fits the phone: nothing scrolls sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const orderId = insertNewOrder();
  try {
    // One poll window (5 s) plus the dev server's render time.
    await expect(orders).toHaveText(String(before + 1), { timeout: 10_000 });
  } finally {
    deleteOrder(orderId);
  }

  const bars = page.getByRole("region", { name: "Pultok" });
  await bars.getByRole("button", { name: "5 perc" }).first().click();
  await expect.poll(() => paused).toEqual([{ minutes: 5 }]);
  await expect(bars.getByRole("alert")).toHaveCount(0);

  const top = page.getByRole("region", { name: "Top 5 termék" });
  const soldOut = page.getByRole("region", { name: "Elfogyott termékek" });
  const first = top
    .getByRole("button", { name: /: Elfogyottra állítom$/ })
    .first();
  const name = (await first.getAttribute("aria-label"))!.replace(
    /: Elfogyottra állítom$/,
    "",
  );
  await first.click();
  const restore = soldOut.getByRole("button", {
    name: `${name}: Újra kapható`,
  });
  await expect(restore).toBeVisible({ timeout: 15_000 });
  await restore.click();
  await expect(restore).toHaveCount(0, { timeout: 15_000 });
});
