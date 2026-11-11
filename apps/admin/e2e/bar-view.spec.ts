import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./db";

// T-054: a manager sets up the tablet, a bartender signs in with name + PIN (seed: Bence, 3003),
// and the board works one tap at a time. The board's apps/api calls are answered with page.route;
// the API itself is covered by its unit tests. Without an Ably token the board polls, which is
// also the path that recovers after a network drop.

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ mode: "serial" });

const orderId = "6650aa0000000000000000a1";
type Status = "new" | "preparing" | "ready" | "expired";

function boardApi(barId: string) {
  const state = { status: "new" as Status, receiptBy: null as string | null };
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  return {
    state,
    async attach(page: Page) {
      await page.route("**/v1/realtime/token", (route) =>
        route.fulfill({ status: 503, body: "{}" }),
      );
      await page.route(`**/v1/bars/${barId}/orders`, (route) =>
        route.fulfill(
          json({
            bar: {
              id: barId,
              name: "Főpult",
              pausedUntil: null,
              maxActiveOrders: null,
            },
            otherBars: [],
            products: [],
            averagePrepMinutes: null,
            orders: [
              {
                id: orderId,
                shortNumber: 42,
                status: state.status,
                version: 1,
                isVip: false,
                adult: true,
                items: [
                  {
                    itemId: "6650aa0000000000000000b1",
                    name: "Cerveza",
                    quantity: 2,
                    options: ["0,5 l"],
                  },
                ],
                paidAt: new Date().toISOString(),
                acceptedAt: null,
                readyAt: null,
                receiptEnteredBy: state.receiptBy,
                reminderSentAt: null,
              },
            ],
          }),
        ),
      );
      await page.route(`**/v1/orders/${orderId}/status`, async (route) => {
        const { event } = route.request().postDataJSON() as { event: string };
        state.status = event === "start_preparing" ? "preparing" : "ready";
        await route.fulfill(json({ ok: true }));
      });
      await page.route(`**/v1/orders/${orderId}/receipt`, async (route) => {
        const { entered } = route.request().postDataJSON() as {
          entered: boolean;
        };
        state.receiptBy = entered ? "Bence" : null;
        await route.fulfill(json({ ok: true }));
      });
    },
  };
}

test("a manager sets up the tablet and a bartender works the board", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  // In CI the dev server compiles /pult on the first visit.
  await page.goto("/pult", { timeout: 60_000 });
  await page
    .getByRole("button", { name: "Tablet beállítása ehhez: Főpult" })
    .click();

  await expect(page).toHaveURL(/\/pin$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Bence" }).click();
  for (const digit of "3003")
    await page.getByRole("button", { name: digit, exact: true }).click();

  await expect(page).toHaveURL(/\/pult\/[0-9a-f]{24}$/, { timeout: 30_000 });
  const barId = page.url().split("/").pop()!;
  const api = boardApi(barId);
  await api.attach(page);
  const card = page.getByRole("article", { name: "42. rendelés" });
  const column = (name: RegExp) => page.getByRole("region", { name });

  // The server render reads the e2e database; the mocked list arrives with the first poll.
  await expect(
    column(/^Új/).getByRole("article", { name: "42. rendelés" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("18+")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pultosváltás (Bence)" }),
  ).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  await card.getByRole("button", { name: "Elkezdem" }).click();
  await expect(
    column(/^Készül/).getByRole("article", { name: "42. rendelés" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Nyugta beütve" }).click();
  await expect(
    card.getByRole("button", { name: "Nyugta beütve: Bence" }),
  ).toBeVisible();

  // Offline: a red bar, the list stays, every button is off; back online, it syncs.
  await context.setOffline(true);
  // Next's route announcer is an alert too: find the banner by its text.
  const banner = page.getByRole("alert").filter({ hasText: "Nincs kapcsolat" });
  await expect(banner).toBeVisible();
  await expect(card.getByRole("button", { name: "Kész" })).toBeDisabled();
  await context.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 15_000 });

  await card.getByRole("button", { name: "Kész" }).click();
  await expect(
    column(/^Kész \(/).getByRole("article", { name: "42. rendelés" }),
  ).toBeVisible();

  // A reload keeps the PIN session but not the audio unlock: the board asks for one tap.
  await page.reload();
  const soundHint = page.getByText("Érintsd meg a képernyőt");
  await expect(soundHint).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(soundHint).toHaveCount(0);
});

test("a second tablet on the same bar picks up the change by itself", async ({
  context,
  page,
}) => {
  await signIn(context, "owner");
  await page.goto("/pult", { timeout: 60_000 });
  await page
    .getByRole("button", { name: "Tablet beállítása ehhez: Főpult" })
    .click();
  await page.getByRole("button", { name: "Bence" }).click();
  for (const digit of "3003")
    await page.getByRole("button", { name: digit, exact: true }).click();
  await expect(page).toHaveURL(/\/pult\/[0-9a-f]{24}$/, { timeout: 30_000 });
  const barId = page.url().split("/").pop()!;
  const api = boardApi(barId);
  await api.attach(page);
  const other = await context.newPage();
  await api.attach(other);
  await other.goto(page.url());
  const card = (p: Page) => p.getByRole("article", { name: "42. rendelés" });
  await expect(card(other)).toBeVisible({ timeout: 15_000 });

  await card(page).getByRole("button", { name: "Elkezdem" }).click();

  await expect(card(other).getByRole("button", { name: "Kész" })).toBeVisible({
    timeout: 15_000,
  });
});
