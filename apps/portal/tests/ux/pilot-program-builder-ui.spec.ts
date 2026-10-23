import { expect, test, type Page } from "@playwright/test";
import type { SaveProgramRequest } from "../../src/lib/contracts/training-drafts";

async function prepare(page: Page, state = "normal") {
  await page.goto(`/?screen=program-builder&state=${state}`);
  await page.getByLabel("Titre du programme · français", { exact: true }).fill("Semaine pilote");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByLabel("Titre de la séance · français", { exact: true }).fill("Séance pilote");
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
}
async function choose(page: Page, sourceId: string, name: string) {
  await page.getByRole("button", { name: "Choisir parmi les 15 exercices pilotes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choisir un exercice pilote", exact: true });
  await dialog.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill(sourceId);
  await dialog.getByRole("button", { name: "Rechercher dans le pilote", exact: true }).click();
  await dialog.getByRole("button", { name: `Consulter ${name}`, exact: true }).click();
  await dialog.getByRole("button", { name: `Ajouter ${name} à la séance`, exact: true }).click();
  return dialog;
}
const saved = (page: Page) => page.evaluate(() => (window as unknown as { __programRequests: SaveProgramRequest[] }).__programRequests);

test("manual exercise creation and ordinary prescriptions do not offer pilot-only configuration", async ({ page }) => {
  await page.goto("/?screen=exercise-library");
  await expect(page.getByLabel("Unité par défaut", { exact: true }).locator('option[value="configuration"]')).toHaveCount(0);
  await prepare(page);
  await page.getByRole("button", { name: "Ajouter Dumbbell Press", exact: true }).click();
  const unit = page.getByRole("article", { name: "Exercice 1", exact: true }).getByLabel("Unité", { exact: true });
  await expect(unit).toBeEnabled();
  await expect(unit.locator('option[value="configuration"]')).toHaveCount(0);
});

test("pilot selection preserves full source snapshot, per-arm counting and independently duplicated prescriptions", async ({ page }) => {
  await prepare(page);
  const dialog = await choose(page, "DB_034", "Curl alterné avec haltères");
  await expect(dialog).toHaveCount(0);
  const exercise = page.getByRole("article", { name: "Exercice 1", exact: true });
  await expect(exercise.getByRole("heading", { name: "Curl alterné avec haltères", exact: true })).toBeVisible();
  await expect(exercise.getByText("Répétitions par bras", { exact: true }).first()).toBeVisible();
  await expect(exercise.getByLabel("Unité", { exact: true })).toBeDisabled();
  expect(await saved(page)).toHaveLength(0);
  await exercise.getByText("Lire les consignes complètes conservées avec ce programme", { exact: true }).click();
  await exercise.getByText("Voir les trois étapes du mouvement", { exact: true }).click();
  await expect(exercise.getByText(/Comptez les répétitions pour chaque bras séparément/)).toBeVisible();
  await exercise.getByText("See the three movement steps", { exact: true }).click();
  await expect(exercise.getByText(/do not combine right and left into one repetition/)).toBeVisible();
  await exercise.getByLabel("Répétitions", { exact: true }).fill("12");
  await exercise.getByLabel("Charge cible", { exact: true }).fill("20 lb par haltère");
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await exercise.getByLabel("Charge cible", { exact: true }).fill("25 lb par haltère");
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  await expect(exercise.getByLabel("Charge cible", { exact: true })).toHaveValue("20 lb par haltère");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.", { exact: true })).toBeVisible();
  const sent = (await saved(page))[0];
  const first = sent.document.weeks[0].sessions[0].blocks[0].exercises[0];
  const second = sent.document.weeks[1].sessions[0].blocks[0].exercises[0];
  expect(first.pilot?.sourceId).toBe("DB_034");
  expect(first.pilot?.usage).toBe("STAGING_TEST");
  expect(first.pilot?.performance.countingDecision).toBe("MAX_PER_ARM_2026_10_23");
  expect(first.pilot?.instructions.en.finish).toContain("do not combine right and left");
  expect(first.pilot).not.toHaveProperty("machines");
  expect(first.media).toBeNull();
  expect(second.pilot).toEqual(first.pilot);
  expect(second.prescription.loadTarget).toBe("25 lb par haltère");
  await page.getByRole("button", { name: "Nouveau programme", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir Semaine pilote", exact: true }).click();
  await expect(exercise.getByRole("heading", { name: "Curl alterné avec haltères", exact: true })).toBeVisible();
});

test("duration, distance and band configuration ask the Coach for explicit goals", async ({ page }) => {
  await prepare(page);
  await choose(page, "BW_049", "Planche sur avant-bras");
  const plank = page.getByRole("article", { name: "Exercice 1", exact: true });
  await expect(plank.getByLabel("Durée cible (secondes)", { exact: true })).toHaveValue("");
  await expect(plank.getByLabel("Passages par série", { exact: true })).toHaveValue("1");
  await expect(plank.getByLabel("Unité", { exact: true })).toHaveValue("sec");
  await choose(page, "DB_045", "Marche du fermier avec haltères");
  const carry = page.getByRole("article", { name: "Exercice 2", exact: true });
  await expect(carry.getByLabel("Distance cible (mètres)", { exact: true })).toHaveValue("");
  await expect(carry.getByLabel("Unité", { exact: true })).toHaveValue("distance");
  await choose(page, "BA_027", "Pallof press debout avec bande");
  const pallof = page.getByRole("article", { name: "Exercice 3", exact: true });
  await expect(pallof.getByLabel("Configuration cible", { exact: true })).toHaveValue("");
  await expect(pallof.getByLabel("Unité", { exact: true })).toHaveValue("configuration");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.", { exact: true })).toBeVisible();
  await page.getByText(/élément\(s\) à compléter/).click();
  await expect(page.getByText(/précise la durée cible en secondes avant publication/)).toBeVisible();
  await expect(page.getByText(/précise la distance cible en mètres avant publication/)).toBeVisible();
  await expect(page.getByText(/précise la configuration cible avant publication/)).toBeVisible();
  await plank.getByLabel("Durée cible (secondes)", { exact: true }).fill("30");
  await carry.getByLabel("Distance cible (mètres)", { exact: true }).fill("20");
  await pallof.getByLabel("Configuration cible", { exact: true }).fill("Bande légère identifiée, ancrage à hauteur poitrine");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré · version 2.", { exact: true })).toBeVisible();
  expect((await saved(page))[1].document.weeks[0].sessions[0].blocks[0].exercises.map((item) => item.prescription.loadTarget)).toEqual(["30", "20", "Bande légère identifiée, ancrage à hauteur poitrine"]);
});

test("lost selection confirmation retries the same identity and never adds an unconfirmed exercise", async ({ page }) => {
  await prepare(page, "pilot-select-response-lost");
  const dialog = await choose(page, "DB_034", "Curl alterné avec haltères");
  await expect(dialog.getByRole("alert")).toContainText("L’ajout n’a pas été confirmé");
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ajouter Curl alterné avec haltères à la séance", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(1);
  const sent = await page.evaluate(() => (window as unknown as { __pilotSelectionRequests: unknown[] }).__pilotSelectionRequests);
  expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]);
});

for (const state of ["pilot-select-disabled", "pilot-select-mismatch"]) {
  test(`${state} fails closed and preserves the draft`, async ({ page }) => {
    await prepare(page, state);
    const dialog = await choose(page, "DB_034", "Curl alterné avec haltères");
    await expect(dialog.getByRole("alert")).toContainText("Ton brouillon est conservé");
    await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Fermer le choix d’exercice", exact: true }).click();
    await expect(page.getByLabel("Titre du programme · français", { exact: true })).toHaveValue("Semaine pilote");
    expect(await saved(page)).toHaveLength(0);
  });
}

test("pilot chooser is keyboard-contained, restores focus and fits narrow screens", async ({ page }) => {
  await prepare(page);
  const open = page.getByRole("button", { name: "Choisir parmi les 15 exercices pilotes", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Choisir un exercice pilote", exact: true });
  await expect(dialog.getByLabel("Nom, muscle ou identifiant", { exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Consulter Traction assistée à machine", exact: true }).click();
  await expect(dialog.getByText(/Non disponible pour prescription · HST_RS2700/)).toBeVisible();
  await expect(dialog.locator("img, video, iframe")).toHaveCount(0);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(await saved(page)).toHaveLength(0);
});
