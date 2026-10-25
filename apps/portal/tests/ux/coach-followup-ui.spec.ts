import { expect, test } from "@playwright/test";

test("Coach saves a private nutrition draft before an explicit centered publication confirmation", async ({ page }, info) => {
  await page.goto("/?screen=coach-followup&state=followup-empty");
  await expect(page.getByRole("heading", { name: "Nutrition et check-ins", exact: true })).toBeVisible();
  await expect(page.getByText("Aucun check-in transmis pour le moment.", { exact: true })).toBeVisible();
  await page.locator("#nutrition-title-fr").fill("Plan personnalisé test");
  await page.getByRole("button", { name: "Ajouter un repas", exact: false }).click();
  const meal = page.getByRole("region", { name: "Repas 1", exact: true });
  await meal.getByRole("group", { name: "Nom du repas *", exact: true }).getByLabel("Français", { exact: true }).fill("Déjeuner");
  await meal.getByRole("group", { name: "Aliments et portions (précise cru/cuit si pertinent) *", exact: true }).getByLabel("Français", { exact: true }).fill("Portions prescrites de test");
  const publish = page.getByRole("button", { name: "Publier le plan nutritionnel", exact: true });
  await expect(publish).toBeDisabled();
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  await expect(publish).toBeEnabled();
  await publish.click();
  const dialog = page.getByRole("dialog", { name: "Publier ce plan?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Annuler", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(publish).toBeFocused();
  await publish.click();
  await dialog.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Plan nutritionnel publié");
  await expect(publish).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __followupCommands: { action: string }[] }).__followupCommands.map(item => item.action))).toEqual(["save", "publish"]);
  await page.screenshot({ path: info.outputPath("coach-nutrition.png"), fullPage: true });
});

test("Coach receives submitted check-ins with bilateral measurements and preserves zero cardio", async ({ page }) => {
  await page.goto("/?screen=coach-followup&state=followup-filled");
  await page.getByText("Observations du 2026-10-25", { exact: true }).click();
  const submission = page.locator("details").filter({ hasText: "Observations du 2026-10-25" });
  await expect(submission.getByText("Bras gauche (po)", { exact: true })).toBeVisible();
  await expect(submission.getByText("Bras droit (po)", { exact: true })).toBeVisible();
  await expect(submission.locator("dl > div").filter({ hasText: "Cardio (minutes)" })).toHaveText("Cardio (minutes)0");
  await page.getByRole("button", { name: "Actualiser les check-ins", exact: true }).click();
  await expect(page.getByRole("button", { name: "Actualiser les check-ins", exact: true })).toBeEnabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("incomplete saved nutrition identifies the first missing required field rather than publishing", async ({ page }) => {
  await page.goto("/?screen=coach-followup&state=followup-empty");
  await page.locator("#nutrition-instructions-fr").fill("Consigne seule, sans repas");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  await page.getByRole("button", { name: "Publier le plan nutritionnel", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Complète le titre");
  await expect(page.locator("#nutrition-title-fr")).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __followupCommands: unknown[] }).__followupCommands.length)).toBe(1);
});
