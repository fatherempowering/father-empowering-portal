import { expect, test } from "@playwright/test";

test("catalogue pages remain bounded, reset on search and clear stale details", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot&state=catalogue-pagination");
  const results = page.getByRole("list", { name: "Résultats du catalogue", exact: true });
  await expect(results.getByRole("listitem")).toHaveCount(50);
  await expect(page.getByText("65 fiches trouvées sur 1186", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consulter Exercice catalogue 1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Fiche détaillée" }).getByText(/plusieurs charges distinctes/)).toBeVisible();
  await page.getByRole("button", { name: "Page suivante", exact: true }).click();
  await expect(results.getByRole("listitem")).toHaveCount(15);
  await expect(page.getByRole("button", { name: "Page suivante", exact: true })).toBeDisabled();
  await expect(page.getByText("Choisis une fiche pour lire ses consignes et vérifier les conventions de saisie.")).toBeVisible();
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("catalogue 65");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await expect(results.getByRole("heading", { name: "Exercice catalogue 65", exact: true })).toBeVisible();
});

test("program search accumulates catalogue pages and explains blocked selection without making a request", async ({ page }) => {
  await page.goto("/?screen=program-builder&state=catalogue-pagination");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un exercice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choisir un exercice", exact: true });
  const results = dialog.getByRole("list", { name: "Résultats des exercices", exact: true });
  await expect(dialog.getByRole("button", { name: "Choisir Exercice catalogue 1", exact: true })).toBeDisabled();
  await expect(dialog.getByText(/plusieurs charges distinctes/)).toBeVisible();
  await dialog.getByRole("button", { name: "Consulter Exercice catalogue 1", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Ajouter Exercice catalogue 1 à la séance", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Afficher plus de résultats", exact: true }).click();
  await expect(results.getByRole("heading", { name: "Exercice catalogue 65", exact: true })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Exercice catalogue 1", exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Afficher plus de résultats", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pilotSelectionRequests: unknown[] }).__pilotSelectionRequests)).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
