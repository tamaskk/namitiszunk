import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./db";

// T-053: a new bar, a VIP table zone with its own QR code, and the code's downloads.

test.describe.configure({ mode: "serial" });

test.describe("bars and QR codes", () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context, "manager");
    // In CI the dev server compiles /bars on the first visit, which can take longer than 5 s.
    await page.goto("/bars", { timeout: 60_000 });
  });

  test("adds a bar and a VIP table zone with its own QR code", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Új pult" }).click();
    await page.getByLabel("Pult neve").fill("E2E pult");
    await page.getByLabel("Nyitva").check();
    await page.getByRole("button", { name: "Mentés" }).click();

    const bar = page.getByRole("region", { name: "E2E pult" });
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await bar.getByRole("button", { name: "Új zóna" }).click();
    await page.getByLabel("Zóna neve").fill("E2E VIP");
    await page.getByLabel("VIP asztal").check();
    await page.getByRole("button", { name: "Mentés" }).click();

    await expect(bar.getByText("E2E VIP")).toBeVisible({ timeout: 30_000 });
    await expect(bar.getByText("VIP", { exact: true })).toBeVisible();
    await expect(bar.getByText(/még nincs beolvasás/)).toBeVisible();
  });

  test("downloads the zone's QR code as PNG and as an A4 poster", async ({
    page,
  }) => {
    const bar = page.getByRole("region", { name: "E2E pult" });

    const [png] = await Promise.all([
      page.waitForEvent("download"),
      bar.getByRole("link", { name: "PNG letöltése: E2E VIP" }).click(),
    ]);
    const [poster] = await Promise.all([
      page.waitForEvent("download"),
      bar.getByRole("link", { name: "A4 plakát letöltése: E2E VIP" }).click(),
    ]);

    expect(png.suggestedFilename()).toMatch(/^qr-[A-Z2-9]{8}-png\.png$/);
    expect(poster.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = await poster.createReadStream();
    const head = await new Promise<string>((resolve) =>
      pdf.once("data", (chunk) => resolve(String(chunk).slice(0, 5))),
    );
    expect(head).toBe("%PDF-");
  });

  test("has no axe violations", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();

    expect(violations).toEqual([]);
  });
});
