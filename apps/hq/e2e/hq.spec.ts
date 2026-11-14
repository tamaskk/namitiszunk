import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  createPlatformAdmin,
  hqSessionCookie,
  latestSession,
  seedId,
  signIn,
  totp,
} from "./db";

// T-066: HQ lets in only a platform member, only after TOTP. Sessions are stored the way the
// e-mail link leaves them (the link itself is Better Auth's and covered by packages/auth tests);
// the TOTP setup, the codes and every refusal run through the real pages.

test.describe.configure({ mode: "serial" });

const HOUR = 60 * 60_000;
let adminId = "";
let secret = "";
let backupCodes: string[] = [];
let sessionLifetime = 0;

async function expectNoAxeViolations(page: Page) {
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
}

test("the first sign-in sets up TOTP, shows the backup codes once and opens HQ", async ({
  context,
  page,
}) => {
  adminId = createPlatformAdmin();
  await signIn(context, hqSessionCookie(adminId));
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });

  await page.goto("/venues", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Kétlépcsős belépés beállítása" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Beállítás indítása" }).click();
  const key = page.locator("code");
  await expect(key).not.toBeEmpty();
  secret = (await key.textContent())!.trim();
  const codes = page
    .getByRole("region", { name: "Tartalékkódok" })
    .getByRole("listitem");
  await expect(codes.first()).toBeVisible();
  backupCodes = await codes.allTextContents();
  await page.getByLabel("Az alkalmazás 6 jegyű kódja").fill(totp(secret));
  await page.getByRole("button", { name: "Bekapcsolás" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Áttekintés" }),
  ).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Központ menü" });
  await expect(menu.getByRole("link")).toHaveText([
    "Áttekintés",
    "Helyszínek",
    "Rendelések",
    "Leadek",
    "Pénzügy",
    "Audit napló",
  ]);
  // Turning TOTP on rotated the session: Better Auth made this one with HQ's lifetime.
  const rotated = latestSession(adminId);
  sessionLifetime =
    Date.parse(rotated.expiresAt) - Date.parse(rotated.createdAt);
  expect(backupCodes.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
  await expectNoAxeViolations(page);
});

test("a later session needs the app's code or a backup code", async ({
  context,
  page,
}) => {
  await signIn(context, hqSessionCookie(adminId));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Kétlépcsős azonosítás" }),
  ).toBeVisible();
  await page.getByLabel("Kód", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Belépés" }).click();
  await expect(
    page.getByLabel("Kód", { exact: true }),
  ).toHaveAccessibleDescription("Hibás kód. Próbáld újra.");
  await page.getByRole("button", { name: "Tartalékkódot használok" }).click();
  await page.getByLabel("Tartalékkód").fill(backupCodes[0]!);
  await page.getByRole("button", { name: "Belépés" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Áttekintés" }),
  ).toBeVisible();

  await signIn(context, hqSessionCookie(adminId));
  await page.goto("/audit");
  await page.getByLabel("Kód", { exact: true }).fill(totp(secret));
  await page.getByRole("button", { name: "Belépés" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Áttekintés" }),
  ).toBeVisible();
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit napló" }),
  ).toBeVisible();
});

test("a TOTP-checked session lasts 8 hours and an ended one asks to sign in again", async ({
  context,
  page,
}) => {
  await signIn(
    context,
    hqSessionCookie(adminId, { verified: true, expiresInMs: -60_000 }),
  );

  await page.goto("/venues");

  expect(sessionLifetime).toBeGreaterThan(8 * HOUR - 60_000);
  expect(sessionLifetime).toBeLessThanOrEqual(8 * HOUR);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Belépés a Központba" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("a club Owner signed in to HQ gets a 403 on every page", async ({
  context,
  page,
}) => {
  await signIn(context, hqSessionCookie(seedId("user:owner")));

  const home = await page.goto("/");
  const venues = await page.request.get("/venues");

  expect(home?.status()).toBe(403);
  expect(venues.status()).toBe(403);
  await expect(
    page.getByRole("heading", { name: "Nincs hozzáférésed" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("HQ is closed to crawlers and to framing", async ({ page }) => {
  const response = await page.goto("/sign-in");
  const robots = await page.request.get("/robots.txt");

  const headers = response!.headers();
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
  expect(await robots.text()).toMatch(/Disallow: \//);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});
