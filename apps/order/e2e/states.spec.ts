import { createHash, randomBytes } from "node:crypto";

import { formatHuf, messages } from "@namitiszunk/i18n";
import { expect, type Page, test } from "@playwright/test";

import { setItemAvailable, upsertDocument } from "./db";

// Error states and edge cases (T-048), each in both languages. Every case must offer a way on.
// Failed payment (4) and double tap (9) need the Stripe stand-in: checkout.spec runs them in both languages.
// Each test seeds its own venue: menu.spec pauses the demo bar, and the menu is cached per slug.

const newId = () => randomBytes(12).toString("hex");
const oid = (hex: string) => ({ $oid: hex });
const date = (at: Date) => ({ $date: at.toISOString() });

/** Budapest wall-clock parts of an instant: ISO weekday and "HH:mm". */
function budapest(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    day: days.indexOf(parts.weekday!) + 1,
    time: `${parts.hour}:${parts.minute}`,
  };
}

type VenueOptions = {
  status?: string;
  timezone?: string;
  openingHours?: { day: number; open: string; close: string }[];
  pausedUntil?: Date;
};

/** A venue with one open bar and one item; returns its slug and ids. */
function seedVenue(options: VenueOptions = {}) {
  const venueId = newId();
  const barId = newId();
  const categoryId = newId();
  const itemId = newId();
  const slug = `e2e-${venueId}`;
  upsertDocument("venues", {
    _id: oid(venueId),
    slug,
    name: "State Club",
    status: options.status ?? "active",
    timezone: options.timezone ?? "Europe/Budapest",
    businessDayStart: "06:00",
    currency: "HUF",
    orderRules: { lastOrderMinutesBeforeClose: 15, maxItemsPerOrder: 10 },
    ...(options.openingHours ? { openingHours: options.openingHours } : {}),
  });
  upsertDocument("bars", {
    _id: oid(barId),
    venueId: oid(venueId),
    name: "Főpult",
    isOpen: true,
    ...(options.pausedUntil ? { pausedUntil: date(options.pausedUntil) } : {}),
  });
  upsertDocument("categories", {
    _id: oid(categoryId),
    venueId: oid(venueId),
    name: "Sörök",
    nameEn: "Beers",
    sortOrder: 0,
  });
  upsertDocument("items", {
    _id: oid(itemId),
    venueId: oid(venueId),
    categoryId: oid(categoryId),
    name: "Sör",
    nameEn: "Beer",
    priceHuf: 900,
    vatRate: 27,
    sortOrder: 0,
    isAvailable: true,
    vipOnly: false,
    modifierGroups: [],
  });
  return { venueId, barId, itemId, slug, menu: `/v/${slug}?bar=${barId}` };
}

/** An order of that venue in one status, with its guest token. */
function seedOrder(
  venue: ReturnType<typeof seedVenue>,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const id = newId();
  const token = randomBytes(16).toString("base64url");
  const now = date(new Date());
  upsertDocument("orders", {
    _id: oid(id),
    venueId: oid(venue.venueId),
    barId: oid(venue.barId),
    shortNumber: 300 + Math.floor(Math.random() * 600),
    businessDate: "2026-11-07",
    status,
    isVip: false,
    items: [
      {
        itemId: oid(newId()),
        name: "Mojito",
        nameEn: "Mojito",
        unitPriceHuf: 2900,
        quantity: 1,
        options: [],
        lineTotalHuf: 2900,
      },
    ],
    subtotalHuf: 2900,
    discountHuf: 0,
    serviceFeeHuf: 0,
    tipHuf: 0,
    totalHuf: 2900,
    pickupCode: "K7Q",
    guestTokenHash: createHash("sha256").update(token).digest("hex"),
    acceptedTermsVersion: "2026-11-01",
    paidAt: now,
    problemReports: [],
    confirmationEmailCount: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  return { id, token };
}

function seedRefund(orderId: string, amountHuf: number) {
  const now = date(new Date());
  upsertDocument("refunds", {
    _id: oid(newId()),
    orderId: oid(orderId),
    status: "succeeded",
    amountHuf,
    createdAt: now,
    updatedAt: now,
  });
}

const withoutPlaceholder = (text: string) => text.split("{")[0]!.trim();

async function rememberOrder(page: Page, order: { id: string; token: string }) {
  await page.addInitScript(
    (stored) => {
      localStorage.setItem("namitiszunk:open-orders", stored);
    },
    JSON.stringify([
      { orderId: order.id, token: order.token, savedAt: Date.now() },
    ]),
  );
}

for (const locale of ["hu", "en"] as const) {
  const m = messages[locale].order;

  test.describe(`guest states (${locale})`, () => {
    // Past the age gate: it has its own tests in menu.spec.
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem("namitiszunk.ageGate", "adult"),
      );
    });

    test("1. a paused bar blocks adding, then reopens without a reload", async ({
      page,
    }) => {
      const venue = seedVenue({ pausedUntil: new Date(Date.now() + 5_000) });

      await page.goto(`/${locale}${venue.menu}`);

      await expect(page.getByText(m.menu.pausedNote)).toBeVisible();
      await expect(page.getByText(m.menu.statusOpen)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(m.menu.pausedNote)).toBeHidden();
    });

    test("2. closed by the opening hours names the next opening; near closing the last order shows", async ({
      page,
    }) => {
      const later = budapest(new Date(Date.now() + 3 * 60 * 60_000));
      const closed = seedVenue({
        openingHours: [
          {
            day: later.day,
            open: later.time,
            close: later.time === "23:59" ? "00:30" : "23:59",
          },
        ],
      });
      const start = budapest(new Date(Date.now() - 60 * 60_000));
      const closing = budapest(new Date(Date.now() + 30 * 60_000));
      const open = seedVenue({
        openingHours: [
          { day: start.day, open: start.time, close: closing.time },
        ],
      });

      await page.goto(`/${locale}${closed.menu}`);
      await expect(page.getByText(m.menu.closedNote)).toBeVisible();
      await expect(
        page.getByText(withoutPlaceholder(m.menu.nextOpen)),
      ).toBeVisible();

      await page.goto(`/${locale}${open.menu}`);
      await expect(
        page.getByText(withoutPlaceholder(m.menu.lastOrder)),
      ).toBeVisible();
    });

    test("3. an item sold out after adding leaves the cart with a message", async ({
      page,
    }) => {
      const venue = seedVenue();
      const fill = (t: string, name: string) => t.replace("{name}", name);
      const beer = locale === "hu" ? "Sör" : "Beer";
      await page.goto(`/${locale}${venue.menu}`);
      await page
        .getByRole("button", {
          name: fill(m.product.addLabel, beer),
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: new RegExp(`^${m.product.toCart.split(" ·")[0]}`),
        })
        .click();
      setItemAvailable(venue.itemId, false);

      await page
        .getByRole("button", {
          name: new RegExp(`^${m.cart.open.split(" ·")[0]} ·`),
        })
        .click();
      await page.getByRole("button", { name: m.cart.continue }).click();

      await expect(
        page.getByRole("dialog").getByText(fill(m.cart.soldOut, beer)),
      ).toBeVisible();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: m.cart.backToMenu }),
      ).toBeVisible();
    });

    test("11. without a connection the menu says so and recovers by itself", async ({
      page,
    }) => {
      const venue = seedVenue();
      await page.goto(`/${locale}${venue.menu}`);
      await expect(page.getByText(m.menu.statusOpen)).toBeVisible();

      // The browser's own events, as when the phone loses and regains the network.
      // Repeated until the page has hydrated and listens.
      await expect(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await expect(page.getByText(m.menu.offline)).toBeVisible({
          timeout: 500,
        });
      }).toPass();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));

      await expect(page.getByText(m.menu.offline)).toBeHidden();
    });

    test("5. after a dropped connection the menu points to the order on this phone", async ({
      page,
    }) => {
      const venue = seedVenue();
      const order = seedOrder(venue, "preparing");
      await rememberOrder(page, order);

      await page.goto(`/${locale}${venue.menu}`);

      await expect(
        page.getByRole("link", { name: m.menu.openOrderLink }),
      ).toHaveAttribute(
        "href",
        `/${locale}/o/${order.id}?t=${encodeURIComponent(order.token)}`,
      );
    });

    test("6. a rejected order gives the reason, the refund and the way back to the menu", async ({
      page,
    }) => {
      const venue = seedVenue();
      const order = seedOrder(venue, "rejected", {
        rejectionReason: "A Mojito elfogyott",
      });
      seedRefund(order.id, 2900);

      await page.goto(`/${locale}/o/${order.id}?t=${order.token}`);

      await expect(
        page.getByRole("heading", { name: m.status.views.rejected.title }),
      ).toBeVisible();
      await expect(page.getByText("A Mojito elfogyott")).toBeVisible();
      await expect(
        page.getByText(formatHuf(2900), { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: m.status.backToMenu }),
      ).toHaveAttribute("href", `/${locale}${venue.menu}`);
    });

    test("7. an expired order says so and offers a problem report", async ({
      page,
    }) => {
      const venue = seedVenue();
      const order = seedOrder(venue, "expired");

      await page.goto(`/${locale}/o/${order.id}?t=${order.token}`);

      await expect(
        page.getByRole("heading", { name: m.status.views.expired.title }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: m.report.button }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: m.status.backToMenu }),
      ).toBeVisible();
    });

    test("8. the live page names the bar to pick up from", async ({ page }) => {
      const venue = seedVenue();
      const order = seedOrder(venue, "preparing");

      await page.goto(`/${locale}/o/${order.id}?t=${order.token}`);

      await expect(
        page.getByText(m.status.pickupAt.replace("{bar}", "Főpult")),
      ).toBeVisible();
    });

    test("10. a refunded order (an underage guest) shows the refund and the way back", async ({
      page,
    }) => {
      const venue = seedVenue();
      const order = seedOrder(venue, "refunded");
      seedRefund(order.id, 2900);

      await page.goto(`/${locale}/o/${order.id}?t=${order.token}`);

      await expect(
        page.getByRole("heading", { name: m.status.views.refunded.title }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: m.status.backToMenu }),
      ).toBeVisible();
    });

    test("12. a venue that is not live yet says so instead of a 404", async ({
      page,
    }) => {
      const venue = seedVenue({ status: "draft" });

      await page.goto(`/${locale}${venue.menu}`);

      await expect(page.getByText(m.menu.inactive)).toBeVisible();
      await expect(
        page.getByRole("link", { name: m.menu.retry }),
      ).toBeVisible();
    });

    test("13. an unexpected server error offers a retry", async ({ page }) => {
      // An unknown time zone makes the live status throw on the server.
      const venue = seedVenue({ timezone: "Not/AZone" });

      await page.goto(`/${locale}${venue.menu}`);

      await expect(page.getByText(m.menu.loadError)).toBeVisible();
      await expect(
        page.getByRole("button", { name: m.menu.retry }),
      ).toBeVisible();
    });
  });
}
