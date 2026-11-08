import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { messages } from "@namitiszunk/i18n";
import { expect, test, type Page } from "@playwright/test";

// The same ids as packages/db seedId(): the e2e seed is deterministic.
const seedId = (key: string) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);

const hu = messages.hu.order.menu;
const en = messages.en.order.menu;
const qrUrl = `/hu/v/demo?bar=${seedId("bar:main")}&zone=${seedId("zone:dancefloor")}&q=demo-dancefloor`;

async function passAgeGate(page: Page) {
  await page.getByRole("button", { name: hu.ageGate.yes }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("QR URL opens the menu with the bar, categories and prices", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "Demo Klub" }),
  ).toBeVisible();
  await expect(
    page.getByText(hu.bar.replace("{name}", "Főpult")),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gin tonik" })).toBeVisible();
  await expect(page.getByText("2 490 Ft").first()).toBeVisible();
  // VIP bottles need a VIP table QR code.
  await expect(page.getByText("Grey Goose 0,7 l")).toHaveCount(0);
  // No horizontal page scroll at 375px; the category bar scrolls on its own.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  const { violations } = await new AxeBuilder({ page })
    .exclude("nextjs-portal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("a VIP table QR code shows the VIP bottles", async ({ page }) => {
  await page.goto(`/hu/v/demo?zone=${seedId("zone:vip-1")}`);
  await passAgeGate(page);

  await expect(
    page.getByRole("heading", { name: "Grey Goose 0,7 l" }),
  ).toBeVisible();
});

test("search filters the loaded menu without a reload", async ({ page }) => {
  await page.goto(qrUrl);
  await passAgeGate(page);

  await page.getByLabel(hu.searchLabel).fill("palinka");

  await expect(
    page.getByRole("heading", { name: "Szilvapálinka" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gin tonik" })).toHaveCount(0);
  await page.getByLabel(hu.searchLabel).fill("nincs ilyen ital");
  await expect(
    page.getByText(hu.noResults.replace("{query}", "nincs ilyen ital")),
  ).toBeVisible();
});

test("a category pill jumps to its section and becomes active", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);
  const nav = page.getByRole("navigation", { name: hu.categories });

  await nav.getByRole("link", { name: "Üdítők" }).click();

  await expect(page.getByRole("heading", { name: "Üdítők" })).toBeInViewport();
  await expect(nav.getByRole("link", { name: "Üdítők" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

test("the language toggle switches to English and keeps the QR parameters", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);

  await page.getByRole("link", { name: hu.otherLanguageLabel }).click();

  await expect(page).toHaveURL(/\/en\/v\/demo\?bar=.*zone=/);
  await expect(
    page.getByRole("heading", { name: "Gin and tonic" }),
  ).toBeVisible();
  // No English name in the seed: the Hungarian one shows.
  await expect(page.getByRole("heading", { name: "Mojito" })).toBeVisible();
  await expect(page.getByLabel(en.searchLabel)).toBeVisible();
});

test("the age gate appears once per device, and No blocks ordering", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await page.getByRole("button", { name: hu.ageGate.no }).click();
  await expect(
    page.getByRole("heading", { name: hu.ageGate.underageTitle }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: hu.ageGate.underageTitle }),
  ).toBeVisible();

  await page.getByRole("button", { name: hu.ageGate.back }).click();
  await passAgeGate(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Gin tonik" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the page refreshes the live status when the tab becomes visible", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/venues/demo/status")),
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))),
  ]);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    data: { status: "open", soldOutItemIds: expect.any(Array) },
  });
  await expect(page.getByText(hu.statusOpen)).toBeVisible();
});

const pollNow = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

test("an item switched to sold out shows on the next poll", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);
  const mojito = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Mojito" }),
  });
  await expect(mojito.getByText(hu.soldOut)).toHaveCount(0);
  await page.route("**/api/venues/demo/status**", (route) =>
    route.fulfill({
      json: {
        data: {
          status: "open",
          pausedUntil: null,
          estimatedWaitMinutes: null,
          soldOutItemIds: [seedId("item:Mojito")],
        },
      },
    }),
  );

  await pollNow(page);

  await expect(mojito.getByText(hu.soldOut)).toBeVisible();
});

test("a failed poll keeps the status and says the connection is down", async ({
  page,
}) => {
  await page.goto(qrUrl);
  await passAgeGate(page);
  await page.route("**/api/venues/demo/status**", (route) => route.abort());

  await pollNow(page);

  await expect(page.getByText(hu.offline)).toBeVisible();
  await expect(page.getByText(hu.statusOpen)).toBeVisible();
  await page.unroute("**/api/venues/demo/status**");
  await pollNow(page);
  await expect(page.getByText(hu.offline)).toHaveCount(0);
});

test("the menu behind the age gate cannot be reached", async ({ page }) => {
  await page.goto(qrUrl);

  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const gated = await page.evaluate(() => {
    const content = document.getElementById("age-gated-content");
    return {
      inert: content?.inert,
      focusBehindGate: content?.contains(document.activeElement) ?? false,
    };
  });
  expect(gated).toEqual({ inert: true, focusBehindGate: false });
});
