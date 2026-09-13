import { expect, test } from "@playwright/test";

test("code preserves zeros, paste, repeated digits and correction without accepting incomplete codes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("code");
  const first = page.getByRole("textbox", { name: "Chiffre 1 sur 6" });
  const third = page.getByRole("textbox", { name: "Chiffre 3 sur 6" });
  // input handles mobile autofill as well as the clipboard paste handler.
  await third.fill("012345");
  await expect(page.getByLabel("Code de test")).toHaveText('"012345"');
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await page.keyboard.press("Backspace");
  await expect(
    page.getByRole("textbox", { name: "Chiffre 5 sur 6" }),
  ).toBeFocused();
  await first.click();
  await page.keyboard.press("0");
  await expect(
    page.getByRole("textbox", { name: "Chiffre 2 sur 6" }),
  ).toBeFocused();
  await first.fill("000000");
  await expect(page.getByLabel("Code de test")).toHaveText('"000000"');
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
});

test("client form keeps focus in its modal, supports a global time zone and inserts the resulting record", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("alex@example.test")).toBeVisible();
  const add = page.getByRole("button", { name: "Ajouter un client" });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Inviter un client" });
  await expect(dialog.getByLabel("Prénom", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByLabel("Prénom", { exact: true }).fill("Émile");
  await dialog.getByLabel("Nom", { exact: true }).fill("Test");
  await dialog
    .getByLabel("Courriel du client", { exact: true })
    .fill("emile@example.test");
  await dialog
    .getByLabel("Fuseau horaire", { exact: true })
    .fill("Asia/Kolkata");
  await dialog.getByRole("button", { name: "Créer et inviter" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "emile@example.test" }),
  ).toContainText("Activation en attente");
  await expect(
    page.getByRole("status").filter({ hasText: "La fiche de Émile Test" }),
  ).toBeVisible();
});

test("revocation is confirmed and invitation feedback follows the server response", async ({
  page,
}) => {
  await page.goto("/");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "julien@example.test" });
  await row.getByRole("button", { name: "Révoquer", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Révoquer cette invitation ?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Révoquer l’invitation" }).click();
  await expect(row).toContainText("Invitation révoquée");
  await expect(dialog).not.toBeVisible();
  await row.getByRole("button", { name: "Renvoyer" }).click();
  await expect(row).toContainText("Envoi en préparation");
});

test("empty and unavailable lists remain distinct", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("empty");
  await expect(
    page.getByRole("heading", { name: "Ton premier client commence ici." }),
  ).toBeVisible();
  await page.getByLabel("État").selectOption("network");
  await expect(page.getByRole("alert")).toContainText(
    "Impossible de charger les clients.",
  );
  await expect(
    page.getByRole("heading", { name: "La liste n’a pas pu être chargée." }),
  ).toBeVisible();
});

test("auth, Coach and Client fit small widths and mobile navigation can close by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 736, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of ["coach", "client", "login", "mfa", "code"]) {
      await page.getByLabel("Écran").selectOption(screen);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} at ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Écran").selectOption("coach");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navigation principale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ouvrir le menu" }),
  ).toBeFocused();
});
