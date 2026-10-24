import { expect, test, type Page } from "@playwright/test";
import type { SaveProgramRequest } from "../../src/lib/contracts/training-drafts";

async function open(page: Page, state = "normal") {
  await page.goto(`/?screen=program-builder&state=${state}`);
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un exercice", exact: true }).click();
  return page.getByRole("dialog", { name: "Choisir un exercice", exact: true });
}

test("one chooser searches library and pilots, aliases find push-ups without opening a detail", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("button", { name: "Choisir Dumbbell Press", exact: true })).toBeVisible();
  for (const query of ["chest", "pushups", "pompes"]) {
    await dialog.getByRole("searchbox", { name: "Rechercher un exercice", exact: true }).fill(query);
    await dialog.getByRole("button", { name: "Rechercher", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Choisir Pompe au sol", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Choisir Rowing unilatéral à machine avec appui de poitrine", exact: true })).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "Choisir Pompe au sol", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true }).getByRole("heading", { name: "Pompe au sol", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un exercice après Pompe au sol", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Choisir Pompe au sol", exact: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Fermer le choix d’exercice", exact: true }).click();
});

test("upper-body and equipment search use a single result list without a fictional cable Pallof", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByRole("searchbox", { name: "Rechercher un exercice", exact: true }).fill("upperbody");
  await dialog.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Choisir Pompe au sol", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Choisir Curl alterné avec haltères", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Choisir Squat gobelet avec haltère", exact: true })).toHaveCount(0);
  await dialog.getByRole("searchbox", { name: "Rechercher un exercice", exact: true }).fill("abdo à la poulie");
  await dialog.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(dialog.getByText(/Aucun exercice pour ces critères/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Choisir Pallof/ })).toHaveCount(0);
  await dialog.getByRole("searchbox", { name: "Rechercher un exercice", exact: true }).fill("Palloff press avec bande");
  await dialog.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Choisir Pallof press debout avec bande", exact: true })).toBeVisible();
});

test("direct choice retries the same protected selection after a lost response", async ({ page }) => {
  const dialog = await open(page, "pilot-select-response-lost");
  const choose = dialog.getByRole("button", { name: "Choisir Curl alterné avec haltères", exact: true });
  await choose.click();
  await expect(dialog.getByRole("alert")).toContainText("L’ajout n’a pas été confirmé");
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(0);
  await choose.click();
  await expect(dialog).toHaveCount(0);
  const requests = await page.evaluate(() => (window as unknown as { __pilotSelectionRequests: unknown[] }).__pilotSelectionRequests);
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  const saves = await page.evaluate(() => (window as unknown as { __programRequests: SaveProgramRequest[] }).__programRequests);
  expect(saves[0].document.weeks[0].sessions[0].blocks[0].exercises).toHaveLength(1);
});

for (const state of ["pilot-select-disabled", "pilot-select-mismatch"]) {
  test(`${state}: direct selection cannot bypass capability or response validation`, async ({ page }) => {
    const dialog = await open(page, state);
    await dialog.getByRole("button", { name: "Choisir Curl alterné avec haltères", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Ton brouillon est conservé");
    await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(0);
  });
}

for (const state of ["exercise-load-error", "pilot-load-error"]) {
  test(`${state}: incomplete search is an error, never an empty successful result`, async ({ page }) => {
    const dialog = await open(page, state);
    await expect(dialog.getByRole("alert")).toContainText("n’a pas pu être chargée complètement");
    await expect(dialog.getByRole("button", { name: /^Choisir / })).toHaveCount(0);
    await expect(dialog.getByText(/Aucun exercice pour ces critères/)).toHaveCount(0);
  });
}

test("unified picker keeps focus, machine warnings, consultation and a narrow mobile layout", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("searchbox", { name: "Rechercher un exercice", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Consulter Traction assistée à machine", exact: true }).click();
  await expect(dialog.getByText(/Non disponible pour prescription · HST_RS2700/)).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter un exercice", exact: true })).toBeFocused();
});
