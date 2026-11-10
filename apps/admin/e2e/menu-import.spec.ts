import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./db";

// T-052: a semicolon CSV from a Hungarian Excel (UTF-8 with BOM), a non-UTF-8 file, row problems.

const header =
  "kategoria;nev;nev_en;leiras;leiras_en;ar;afa;alkohol;allergenek;csak_vip";

function csvFile(
  name: string,
  text: string,
  encoding: BufferEncoding = "utf8",
) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(text, encoding) };
}

async function upload(page: Page, file: ReturnType<typeof csvFile>) {
  await page.getByLabel("CSV fájl").setInputFiles(file);
}

test.describe.configure({ mode: "serial" });

test.describe("menu import", () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context, "manager");
    await page.goto("/menu/import");
  });

  test("imports a semicolon CSV saved by a Hungarian Excel", async ({
    page,
  }) => {
    await upload(
      page,
      csvFile(
        "menu.csv",
        [
          `﻿${header}`,
          "E2E Import;Fröccs;;Fehérbor, szóda;;1 200 Ft;27%;6,5;Kén-dioxid és szulfitok;",
          "E2E Import;Limonádé;Lemonade;;;1100;27;;;nem",
        ].join("\r\n"),
      ),
    );

    await expect(
      page.getByText("2 új termék, nincs kihagyott, 1 új kategória."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Importálás" }).click();
    await expect(page.getByText("2 termék importálva.")).toBeVisible();
    await page.getByRole("link", { name: "Vissza a menühöz" }).last().click();

    const category = page.getByRole("region", { name: "E2E Import" });
    await expect(
      category.getByRole("button", { name: /^Szerkesztés: Fröccs/ }),
    ).toBeVisible();
  });

  test("skips an item that is already on the menu", async ({ page }) => {
    await upload(
      page,
      csvFile("again.csv", `${header}\nE2E Import;Fröccs;;;;1200;27;;;`),
    );

    await expect(page.getByText("Már létezik, kimarad")).toBeVisible();
    await expect(page.getByText("A fájlban nincs új termék.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importálás" })).toHaveCount(
      0,
    );
  });

  test("asks for UTF-8 when Excel saved the file in another encoding", async ({
    page,
  }) => {
    await upload(
      page,
      csvFile("latin.csv", `${header}\nÜdítők;Kóla;;;;900;27;;;`, "latin1"),
    );

    await expect(
      page.getByText(
        "A fájl nem UTF-8 kódolású. Mentsd CSV UTF-8 formátumban, és töltsd fel újra.",
      ),
    ).toBeVisible();
  });

  test("lists every problem with its line and does not offer the import", async ({
    page,
  }) => {
    await upload(
      page,
      csvFile(
        "bad.csv",
        [
          header,
          "Koktélok;Gin tonic;;;;két ezer;27;;;",
          "Koktélok;Mojito;;;;2400;27;;csoki;",
        ].join("\n"),
      ),
    );

    await expect(
      page.getByText("2 hiba a fájlban.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("2. sor, „ar”:")).toBeVisible();
    await expect(page.getByText("Ismeretlen allergén: csoki.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importálás" })).toHaveCount(
      0,
    );
  });

  test("offers the template for download", async ({ page }) => {
    const template = page.getByRole("link", { name: "Sablon letöltése" });

    await expect(template).toHaveAttribute("href", "/menu-sablon.csv");
    const response = await page.request.get("/menu-sablon.csv");
    expect((await response.text()).startsWith(`﻿${header}`)).toBe(true);
  });

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("fits without horizontal scrolling and passes axe", async ({
      page,
    }) => {
      await upload(
        page,
        csvFile("phone.csv", `${header}\nE2E Telefon;Tonik;;;;700;27;;;`),
      );
      await expect(page.getByText(/1 új termék/)).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations).toEqual([]);
    });
  });
});
