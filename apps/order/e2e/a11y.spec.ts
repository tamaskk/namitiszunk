import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { seedGuestToken, seedId, upsertDocument } from "./db";

// T-049: every guest page passes axe (WCAG 2.1 AA) and every control visible on load is at least
// 48×48 px (DESIGN_SYSTEM §08) at 375px, in both languages. Sheets, the cart and dialogs open in the
// flow specs (cart, checkout, guest-pages, states), which run axe on them.

const qr = `bar=${seedId("bar:main")}&zone=${seedId("zone:dancefloor")}`;
// Seeded demo orders: order:3 is being prepared, order:5 was picked up.
const preparing = seedId("order:3");
const pickedUp = seedId("order:5");
const draftSlug = "e2e-a11y-draft";

const pages = [
  { name: "age gate", path: `/v/demo?${qr}`, adult: false },
  { name: "menu", path: `/v/demo?${qr}` },
  { name: "checkout", path: `/v/demo/checkout?${qr}` },
  {
    name: "live order",
    path: `/o/${preparing}?t=${seedGuestToken("order:3")}`,
  },
  {
    name: "thanks",
    path: `/o/${pickedUp}/thanks?t=${seedGuestToken("order:5")}`,
  },
  {
    name: "payment confirmation",
    path: `/r/${pickedUp}?t=${seedGuestToken("order:5")}`,
  },
  { name: "account sign-in", path: "/fiok" },
  { name: "inactive venue", path: `/v/${draftSlug}` },
];

test.beforeAll(() => {
  upsertDocument("venues", {
    _id: { $oid: seedId("venue:e2e-a11y-draft") },
    slug: draftSlug,
    name: "Draft Club",
    status: "draft",
    timezone: "Europe/Budapest",
    businessDayStart: "06:00",
    currency: "HUF",
  });
});

/**
 * Visible controls smaller than 48×48 px. A link inside running text is exempt
 * (WCAG 2.5.8 inline exception): it sits in a sentence, not in a row of controls.
 */
function smallTargets(page: Page) {
  return page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"]';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        if (el.closest("[inert], [aria-hidden='true'], nextjs-portal"))
          return false;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden") return false;
        const inline =
          el.tagName === "A" &&
          style.display === "inline" &&
          (el.parentElement?.textContent?.trim().length ?? 0) >
            (el.textContent?.trim().length ?? 0);
        if (inline) return false;
        // A visually hidden input is operated through its label; the label is what is tapped.
        const target =
          el instanceof HTMLInputElement && box.width <= 1
            ? (el.labels?.[0] ?? el)
            : el;
        const tap = target.getBoundingClientRect();
        return tap.width < 48 || tap.height < 48;
      })
      .map((el) => {
        const box = el.getBoundingClientRect();
        const label = (
          el.getAttribute("aria-label") ??
          el.textContent ??
          ""
        ).trim();
        return `${el.tagName.toLowerCase()} "${label.slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`;
      });
  });
}

for (const locale of ["hu", "en"] as const) {
  test.describe(`page sweep (${locale})`, () => {
    for (const { name, path, adult = true } of pages) {
      test(`${name}: no axe violations, 48 px touch targets`, async ({
        page,
      }) => {
        if (adult)
          await page.addInitScript(() =>
            localStorage.setItem("namitiszunk.ageGate", "adult"),
          );

        await page.goto(`/${locale}${path}`);
        await expect(page.locator("main, [role=dialog]").first()).toBeVisible();
        const { violations } = await new AxeBuilder({ page })
          .exclude("nextjs-portal")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(
          violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`,
          ),
        ).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
      });
    }
  });
}
