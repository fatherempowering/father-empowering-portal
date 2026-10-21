import { expect, test } from "@playwright/test";

test("Coach sees no draft photos or results before explicit submission", async ({ page }) => {
  await page.goto("/?screen=coach-week-zero&state=acquisition-draft");
  await expect(page.getByTestId("week-zero-acquisition-status")).toHaveText("Non transmise");
  await expect(page.getByText("Aucune semaine zéro complète transmise", { exact: true })).toBeVisible();
  await expect(page.locator('img[src*="/week-zero/photos"]')).toHaveCount(0);
  await expect(page.getByText("207.5 lb")).toHaveCount(0);
});

test("Coach distinguishes submitted exceptions from completed performance", async ({ page }) => {
  await page.goto("/?screen=coach-week-zero&state=acquisition-submitted");
  await expect(page.getByTestId("week-zero-acquisition-status")).toHaveText("Transmise avec éléments non réalisés");
  await expect(page.getByTestId("acquisition-legPress")).toContainText("Non réalisé — à revoir avec le Coach");
  await expect(page.getByTestId("acquisition-cardio")).toContainText("Concept2 non disponible");
  await expect(page.getByTestId("acquisition-cardio")).not.toContainText("mL/kg/min");
  await expect(page.locator('img[src*="/week-zero/photos"]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("Coach can retry a failed load without fabricated success", async ({ page }) => {
  await page.goto("/?screen=coach-week-zero&state=acquisition-load-error");
  await expect(page.getByRole("alert")).toContainText("Impossible de charger la semaine zéro");
  await expect(page.getByTestId("week-zero-acquisition-status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toBeEnabled();
});
