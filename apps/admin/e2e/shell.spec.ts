import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resumeVenueOrders, signIn, venueOrdersPausedAt } from "./db";

// T-050 acceptance: role-based menu, 403 on owner modules for a manager, the venue-wide pause, 375px.

const ownerOnly = ["/promos", "/payouts", "/settings", "/billing"];

test.describe("admin shell", () => {
  test.afterEach(() => resumeVenueOrders());

  test("sends a visitor without a session to sign in", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("button", { name: "Belépési link küldése" }),
    ).toBeVisible();
  });

  test("shows the owner every module", async ({ page, context }) => {
    await signIn(context, "owner");

    await page.goto("/settings");

    const nav = page.getByRole("navigation", { name: "Főmenü" }).first();
    for (const name of [
      "Irányítópult",
      "Kifizetések",
      "Beállítások",
      "Díjak és számlák",
    ])
      await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Beállítások" }),
    ).toBeVisible();
  });

  test("hides owner modules from a manager and answers their URLs with 403", async ({
    page,
    context,
  }) => {
    await signIn(context, "manager");

    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Főmenü" }).first();
    await expect(nav.getByRole("link", { name: "Menü" })).toBeVisible();
    for (const name of [
      "Akciók",
      "Kifizetések",
      "Beállítások",
      "Díjak és számlák",
    ])
      await expect(nav.getByRole("link", { name })).toHaveCount(0);

    for (const path of ownerOnly) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(
        page.getByRole("heading", { name: "Ehhez nincs jogosultságod" }),
      ).toBeVisible();
    }
  });

  test("pauses and resumes ordering at the whole venue after a confirmation", async ({
    page,
    context,
  }) => {
    await signIn(context, "manager");
    await page.goto("/");

    await page.getByRole("button", { name: /Nyitva/ }).click();
    await page.getByRole("button", { name: "Szüneteltetés" }).click();

    await expect(
      page.getByText("A rendelés minden pultnál szünetel."),
    ).toBeVisible();
    expect(venueOrdersPausedAt()).not.toBeNull();

    await page.getByRole("button", { name: /Szünetel/ }).click();
    await page.getByRole("button", { name: "Újraindítás" }).click();

    await expect(page.getByRole("button", { name: /Nyitva/ })).toBeVisible();
    expect(venueOrdersPausedAt()).toBeNull();
  });

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("fits without horizontal scrolling and passes axe", async ({
      page,
      context,
    }) => {
      await signIn(context, "owner");

      await page.goto("/");
      await page.getByRole("button", { name: "Továbbiak" }).click();
      await expect(
        page.getByRole("dialog").getByRole("link", { name: "Beállítások" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations).toEqual([]);
    });
  });
});
