import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-057: a manager adds a bartender with a PIN (a taken PIN is refused), disables them, and signs a
// bar tablet out; the tablet then asks for a manager again. A broken invite link shows an error.
// Seed: Bence's PIN is 3003. Sending a real invite (Resend) is a manual check in TASKS.md.

test.describe.configure({ mode: "serial" });

test("adds a bartender, refuses a taken PIN and disables the new member", async ({
  context,
  page,
}) => {
  await signIn(context, "manager");
  // In CI the dev server compiles /staff on the first visit.
  await page.goto("/staff", { timeout: 60_000 });
  // A Manager cannot invite managers or owners: only the Owner sees the button.
  await expect(
    page.getByRole("button", { name: "Manager vagy tulajdonos meghívása" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Pultos vagy VIP-host felvétele" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Név").fill("Teszt Tamara");
  await dialog.getByLabel("PIN-kód").fill("3003");
  await dialog.getByRole("button", { name: "Felvétel" }).click();
  await expect(
    dialog.getByText("Ez a PIN már foglalt. Válassz másikat."),
  ).toBeVisible();

  await dialog.getByLabel("PIN-kód").fill("7531");
  await dialog.getByRole("button", { name: "Felvétel" }).click();
  await expect(page.getByText("Teszt Tamara felvéve.")).toBeVisible();
  const members = page.getByRole("region", { name: "Tagok" });
  const row = members.getByRole("listitem").filter({ hasText: "Teszt Tamara" });
  await expect(row.getByText("Aktív")).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);

  await row.getByRole("button", { name: "Letiltás" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Letiltás" })
    .click();
  await expect(row.getByText("Letiltva")).toBeVisible();
});

test("a tablet signed out in Staff asks for a manager again", async ({
  browser,
}) => {
  const tablet = await browser.newContext();
  const tabletPage = await tablet.newPage();
  await signIn(tablet, "owner");
  await tabletPage.goto("/pult", { timeout: 60_000 });
  await tabletPage
    .getByRole("button", { name: "Tablet beállítása ehhez: Főpult" })
    .click();
  await expect(tabletPage).toHaveURL(/\/pin$/, { timeout: 30_000 });

  const office = await browser.newContext();
  const page = await office.newPage();
  await signIn(office, "manager");
  await page.goto("/staff", { timeout: 60_000 });
  const devices = page.getByRole("region", { name: "Belépett eszközök" });
  await devices
    .getByRole("listitem")
    .filter({ hasText: "Főpult" })
    .first()
    .getByRole("button", { name: "Kijelentkeztetés" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kijelentkeztetés" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await tabletPage.reload();
  await expect(
    tabletPage.getByText("Ezt az eszközt kijelentkeztették."),
  ).toBeVisible();
  await tabletPage.getByRole("button", { name: "Belépés managerként" }).click();
  await expect(tabletPage).toHaveURL(/\/sign-in$/, { timeout: 30_000 });

  await tablet.close();
  await office.close();
});

test("an expired or unknown invite link shows an error on accept", async ({
  context,
  page,
}) => {
  const token = "a".repeat(43);
  await page.goto(`/invite?token=${token}`, { timeout: 60_000 });
  // Signed out: sign in first, and the sign-in returns to this invite.
  await expect(page.getByRole("link", { name: "Belépés" })).toHaveAttribute(
    "href",
    `/sign-in?invite=${token}`,
  );

  await signIn(context, "manager");
  await page.reload();
  await page.getByRole("button", { name: "Meghívás elfogadása" }).click();

  await expect(
    page.getByText(
      "Ez a meghívó lejárt, már felhasználták, vagy hibás a link.",
    ),
  ).toBeVisible({ timeout: 30_000 });
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
});
