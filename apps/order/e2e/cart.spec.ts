import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { formatHuf, messages } from "@namitiszunk/i18n";
import { expect, test, type Page } from "@playwright/test";

import { setItemAvailable } from "./db";

const seedId = (key: string) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );

const { menu, product, cart } = messages.hu.order;
const bar = seedId("bar:main");
const zone = seedId("zone:dancefloor");
const qrUrl = `/hu/v/demo?bar=${bar}&zone=${zone}`;
const E2E_PORT = 3101;

async function openMenu(page: Page) {
  await page.goto(qrUrl);
  await page.getByRole("button", { name: menu.ageGate.yes }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const addButton = (page: Page, name: string) =>
  page.getByRole("button", {
    name: fill(product.addLabel, { name }),
    exact: true,
  });
const cartButton = (page: Page) =>
  page.getByRole("button", { name: /^Kosár · / });
const toCart = (page: Page) =>
  page.getByRole("dialog").getByRole("button", { name: /^Kosárba/ });

async function addPlain(page: Page, name: string, quantity = 1) {
  await addButton(page, name).click();
  for (let i = 1; i < quantity; i++) {
    await page.getByRole("button", { name: product.increase }).click();
  }
  await toCart(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("an item with options goes into the cart; a missing required option blocks it with a message", async ({
  page,
}) => {
  await openMenu(page);

  await addButton(page, "Dreher Classic").click();
  const sheet = page.getByRole("dialog", { name: "Dreher Classic" });
  await expect(toCart(page)).toBeDisabled();
  await expect(
    sheet.getByText(fill(product.missing, { groups: "Méret" })),
  ).toBeVisible();
  await sheet.getByRole("radio", { name: /0,5 l/ }).check();
  await expect(toCart(page)).toHaveText(
    fill(product.toCart, { price: formatHuf(1390) }),
  );
  await toCart(page).click();

  await addButton(page, "Mojito").click();
  await page.getByRole("checkbox", { name: /Dupla alap/ }).check();
  await page.getByLabel(product.note).fill("Kevés jéggel");
  await toCart(page).click();

  await expect(cartButton(page)).toHaveText(
    fill(cart.open, { count: 2, subtotal: formatHuf(1390 + 3390) }),
  );
  await cartButton(page).click();
  const cartSheet = page.getByRole("dialog", { name: cart.title });
  await expect(cartSheet.getByText("0,5 l")).toBeVisible();
  await expect(
    cartSheet.getByText(fill(cart.note, { note: "Kevés jéggel" })),
  ).toBeVisible();
  await expect(cartSheet.getByText(formatHuf(4780)).first()).toBeVisible();
});

test("the 11th item is blocked with the limit message", async ({ page }) => {
  await openMenu(page);

  await addPlain(page, "Coca-Cola", 10);

  await expect(addButton(page, "Tonik")).toBeDisabled();
  await expect(
    page.getByText(fill(cart.limit, { max: 10 })).first(),
  ).toBeVisible();
  await cartButton(page).click();
  await expect(
    page.getByRole("button", {
      name: fill(cart.increase, { name: "Coca-Cola" }),
      exact: true,
    }),
  ).toBeDisabled();
});

test("an item sold out after adding is removed at Tovább with a message", async ({
  page,
}) => {
  const gin = seedId("item:Gin tonik");
  await openMenu(page);
  await addPlain(page, "Gin tonik");
  await addPlain(page, "Coca-Cola");

  setItemAvailable(E2E_PORT, gin, false);
  try {
    await cartButton(page).click();
    await page.getByRole("button", { name: cart.continue }).click();

    const cartSheet = page.getByRole("dialog", { name: cart.title });
    await expect(
      cartSheet.getByText(fill(cart.soldOut, { name: "Gin tonik" })),
    ).toBeVisible();
    await expect(
      cartSheet.getByRole("button", {
        name: fill(cart.remove, { name: "Gin tonik" }),
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      cartSheet.getByRole("button", {
        name: fill(cart.remove, { name: "Coca-Cola" }),
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    setItemAvailable(E2E_PORT, gin, true);
  }
});

test("Tovább with a valid cart opens checkout with the bar and zone kept", async ({
  page,
}) => {
  await openMenu(page);
  await addPlain(page, "Coca-Cola");

  await cartButton(page).click();
  await page.getByRole("button", { name: cart.continue }).click();

  await expect(page).toHaveURL(
    new RegExp(`/hu/v/demo/checkout\\?bar=${bar}&zone=${zone}$`),
  );
  await expect(
    page.getByRole("heading", { name: messages.hu.order.checkout.title }),
  ).toBeVisible();
});

test("the cart survives a reload, and removing the last line shows the empty cart", async ({
  page,
}) => {
  await openMenu(page);
  await addPlain(page, "Tonik", 2);

  await page.reload();

  await expect(cartButton(page)).toHaveText(
    fill(cart.open, { count: 2, subtotal: formatHuf(1380) }),
  );
  await cartButton(page).click();
  await page
    .getByRole("button", {
      name: fill(cart.remove, { name: "Tonik" }),
      exact: true,
    })
    .click();
  await expect(page.getByText(cart.empty)).toBeVisible();
});

test("the product sheet works with the keyboard alone and passes axe", async ({
  page,
}) => {
  await openMenu(page);
  const add = addButton(page, "Dreher Classic");

  await add.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Dreher Classic" });
  await expect(sheet).toBeVisible();
  // Focus is trapped in the sheet: Tab never leaves it.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  const { violations } = await new AxeBuilder({ page })
    .include("[role=dialog]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await sheet.getByRole("radio", { name: /0,3 l/ }).focus();
  await page.keyboard.press("Space");
  await toCart(page).focus();
  await page.keyboard.press("Enter");

  await expect(sheet).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(cartButton(page)).toHaveText(
    fill(cart.open, { count: 1, subtotal: formatHuf(990) }),
  );
});
