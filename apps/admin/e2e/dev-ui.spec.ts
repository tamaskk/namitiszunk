import AxeBuilder from "@axe-core/playwright";
import { locales, messages } from "@namitiszunk/i18n";
import { expect, test, type Page } from "@playwright/test";

const wcagAA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    // The Next.js dev overlay is not our UI and does not ship to production.
    .exclude("nextjs-portal")
    .withTags(wcagAA)
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`),
  ).toEqual([]);
}

for (const locale of locales) {
  const copy = messages[locale].admin.devUi;

  test.describe(`UI showcase (${locale})`, () => {
    test.beforeEach(async ({ context, page }) => {
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: "http://localhost:3102" },
      ]);
      await page.goto("/dev/ui");
      await expect(
        page.getByRole("heading", { level: 1, name: copy.title }),
      ).toBeVisible();
    });

    test("has no WCAG AA violations, contrast included", async ({ page }) => {
      await expectNoViolations(page);
    });

    test("form error, dialog and sheet stay accessible", async ({ page }) => {
      await page.getByRole("button", { name: copy.submit }).click();
      await expect(page.getByText(copy.emailRequired)).toBeVisible();
      await expectNoViolations(page);

      await page.getByRole("button", { name: copy.openDialog }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expectNoViolations(page);
      // Destructive dialog: Escape must not close it, only its own buttons.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: copy.cancel }).click();
      await expect(dialog).toBeHidden();

      await page.getByRole("button", { name: copy.openSheet }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page);
    });

    test("visible buttons are at least 48px high", async ({ page }) => {
      const buttons = page
        .locator("main")
        .getByRole("button")
        .filter({ visible: true });
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        const name = (await button.textContent())?.trim();
        expect(box, `button "${name}" has no box`).not.toBeNull();
        expect(box!.height, `button "${name}"`).toBeGreaterThanOrEqual(48);
      }
    });
  });
}
