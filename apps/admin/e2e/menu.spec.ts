import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { seedId, signIn } from "./db";

// T-051: an item with options, ordering, sold out, preview, 375px. The bartender PIN 403 is
// covered in packages/core (admin-menu.test.ts) and by the module check behind this page.

test.describe.configure({ mode: "serial" });

// The editor updates optimistically; a reload before the server action has answered aborts it,
// and on a slow runner the change is lost (the CI flake). Start waiting before the action fires.
const menuActionDone = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/menu",
  );

test.describe("menu editor", () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context, "manager");
    await page.goto("/menu");
  });

  test("adds an item with an option group", async ({ page }) => {
    const cocktails = page.getByRole("region", { name: "Koktélok" });

    await cocktails.getByRole("button", { name: "Új termék" }).click();
    const sheet = page.getByRole("dialog", { name: "Új termék" });
    await sheet.getByLabel("Név", { exact: true }).fill("E2E Paloma");
    await sheet.getByLabel("Ár (Ft)").fill("2900");
    await sheet.getByLabel("Tej").check();
    await sheet.getByRole("button", { name: "Új opciócsoport" }).click();
    await sheet.getByLabel("Csoport neve").fill("Tequila");
    await sheet.getByLabel("Opció neve").fill("Blanco");
    await sheet.getByLabel("Felár (Ft)").fill("400");
    await sheet.getByRole("button", { name: "Mentés" }).click();

    await expect(sheet).toBeHidden();
    await expect(
      cocktails.getByRole("button", { name: /^Szerkesztés: E2E Paloma/ }),
    ).toBeVisible();
    await cocktails
      .getByRole("button", { name: /^Szerkesztés: E2E Paloma/ })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("Csoport neve"),
    ).toHaveValue("Tequila");
  });

  test("shows a field error instead of saving an empty name", async ({
    page,
  }) => {
    await page
      .getByRole("region", { name: "Koktélok" })
      .getByRole("button", { name: "Új termék" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Új termék" });
    await sheet.getByLabel("Ár (Ft)").fill("1000");

    await sheet.getByRole("button", { name: "Mentés" }).click();

    await expect(sheet.getByLabel("Név", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("marks an item sold out with one tap and keeps it after reload", async ({
    page,
  }) => {
    const beers = page.getByRole("region", { name: "Sörök" });
    const toggle = beers.getByRole("button", { name: /: Elfogyott$/ }).first();
    const label = (await toggle.textContent())!;
    const row = page.getByRole("button", { name: label, exact: true });
    await expect(row).toHaveAttribute("aria-pressed", "false");

    const saved = menuActionDone(page);
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await saved;
    await page.reload();

    await expect(row).toHaveAttribute("aria-pressed", "true");
    const restored = menuActionDone(page);
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    // The next test starts from the seeded state only once this write has landed.
    await restored;
  });

  test("reorders categories with the keyboard", async ({ page }) => {
    const headings = page.getByRole("heading", { level: 2 });
    const [first, second] = await headings.allTextContents();

    const saved = menuActionDone(page);
    await page.getByRole("button", { name: `${first} áthelyezése` }).focus();
    // dnd-kit measures the rows after the pick-up; a key per frame mimics a person.
    for (const key of ["Space", "ArrowDown", "Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
    }
    await expect(headings.first()).toHaveText(second!);
    await saved;
    await page.reload();

    await expect(headings.nth(0)).toHaveText(second!);
    await expect(headings.nth(1)).toHaveText(first!);
  });

  test("links the preview to the guest menu at the chosen bar", async ({
    page,
  }) => {
    await page.getByLabel("Pult az előnézethez").click();
    await page.getByRole("option", { name: "Terasz pult" }).click();

    const preview = page.getByRole("link", { name: /^Előnézet/ });

    await expect(preview).toHaveAttribute("target", "_blank");
    await expect(preview).toHaveAttribute(
      "href",
      `http://localhost:3001/hu/v/demo?bar=${seedId("bar:terrace")}`,
    );
  });

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("fits without horizontal scrolling and passes axe", async ({
      page,
    }) => {
      await expect(page.getByRole("heading", { name: "Menü" })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations).toEqual([]);
    });
  });
});
