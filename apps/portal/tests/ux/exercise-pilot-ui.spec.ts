import { expect, test } from "@playwright/test";

test("Coach explores the pilot separately without changing the existing library", async ({ page }) => {
  await page.goto("/?screen=exercise-library");
  await page.getByLabel("Nom de l’exercice (anglais)").fill("Mon exercice non enregistré");
  await page.getByRole("button", { name: "Explorer le catalogue Legacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catalogue d’exercices.", exact: true })).toBeVisible();
  await expect(page.getByText("15 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consulter Squat gobelet avec haltère", exact: true }).click();
  await expect(page.getByLabel("Nom de l’exercice (anglais)")).toHaveValue("Mon exercice non enregistré");
  await page.getByRole("button", { name: "Fermer le catalogue", exact: true }).click();
  await expect(page.getByLabel("Nom de l’exercice (anglais)")).toHaveValue("Mon exercice non enregistré");
  expect(await page.evaluate(() => (window as unknown as { __exerciseRequests: unknown[] }).__exerciseRequests)).toEqual([]);
});

test("muscle search and equipment filtering use the fifteen real pilot fiches", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot");
  await expect(page.getByText("15 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("ischio-fessiers");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("5 fiches trouvées sur 15", { exact: true })).toBeVisible();
  const results = page.getByRole("list", { name: "Résultats du catalogue", exact: true });
  await expect(results.getByRole("heading").first()).toHaveText("Soulevé de terre conventionnel");
  await page.getByLabel("Équipement", { exact: true }).selectOption("barbell");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("2 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Soulevé de terre conventionnel", exact: true })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Squat arrière barre haute", exact: true })).toBeVisible();
  await page.getByLabel("Équipement", { exact: true }).selectOption("");
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("chest");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("3 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await expect(results.getByText("MA_063", { exact: true })).toHaveCount(0);
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("chest supported row");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("1 fiche trouvée sur 15", { exact: true })).toBeVisible();
  await expect(results.getByText("MA_063", { exact: true })).toBeVisible();
});

test("stabilizers are explicitly opt-in and empty results do not retain a stale detail", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot");
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("abdominaux");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("2 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await page.getByLabel("Inclure les muscles stabilisateurs dans la recherche").check();
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("14 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consulter Planche sur avant-bras", exact: true }).click();
  const detail = page.getByRole("region", { name: "Fiche détaillée", exact: true });
  await expect(detail.getByRole("heading", { name: "Planche sur avant-bras", exact: true }).first()).toBeFocused();
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("aucun-exercice-correspondant");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await expect(page.getByText("0 fiches trouvées sur 15", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucune fiche ne correspond à ces critères. Essaie un autre nom ou retire le filtre d’équipement.", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Planche sur avant-bras", exact: true })).toHaveCount(0);
});

test("complete instructions and the approved per-arm count are explicit in French and English", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot");
  await page.getByRole("button", { name: "Consulter Curl alterné avec haltères", exact: true }).click();
  const detail = page.getByRole("region", { name: "Fiche détaillée", exact: true });
  await expect(detail.getByRole("heading", { name: "Installation", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Exécution", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Fin du mouvement", exact: true })).toBeVisible();
  await expect(detail.getByText("Comptage retenu : répétitions par bras", { exact: true })).toBeVisible();
  await expect(detail.getByText("Brouillon · consignes à valider", { exact: true })).toBeVisible();
  await page.getByLabel("Langue de la fiche", { exact: true }).selectOption("en");
  await expect(detail.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Execution", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Finish", exact: true })).toBeVisible();
  await expect(detail.getByText("Selected count: repetitions per arm", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Alternating dumbbell curl", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /ajouter|publier|valider|enregistrer/i })).toHaveCount(0);
  await expect(page.locator("img, video, iframe")).toHaveCount(0);
});

test("unconfirmed machines remain documentary and long guidance fits narrow screens", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot");
  await page.getByRole("button", { name: "Consulter Traction assistée à machine", exact: true }).click();
  const detail = page.getByRole("region", { name: "Fiche détaillée", exact: true });
  await expect(detail.getByText("Rapprochement de famille — modèle à confirmer.", { exact: true })).toBeVisible();
  await expect(detail.getByText(/Non disponible pour prescription · HST_RS2700/)).toBeVisible();
  await expect(detail.getByText(/Aucune image ni vidéo livrée pour cette fiche/)).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("return to results restores the selected button without losing filters or language", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot");
  await page.getByLabel("Nom, muscle ou identifiant", { exact: true }).fill("DB_034");
  await page.getByLabel("Équipement", { exact: true }).selectOption("dumbbell");
  await page.getByRole("button", { name: "Rechercher dans le catalogue", exact: true }).click();
  await page.getByRole("button", { name: "Consulter Curl alterné avec haltères", exact: true }).click();
  await page.getByLabel("Langue de la fiche", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Retour aux résultats", exact: true }).click();
  await expect(page.getByRole("button", { name: "Consulter Alternating dumbbell curl", exact: true })).toBeFocused();
  await expect(page.getByLabel("Nom, muscle ou identifiant", { exact: true })).toHaveValue("DB_034");
  await expect(page.getByLabel("Équipement", { exact: true })).toHaveValue("dumbbell");
  await expect(page.getByLabel("Langue de la fiche", { exact: true })).toHaveValue("en");
  await expect(page.getByText("1 fiche trouvée sur 15", { exact: true })).toBeVisible();
});

for (const state of ["pilot-load-error", "pilot-malformed"]) {
  test(`${state} is fail-closed, never an empty or approved catalogue`, async ({ page }) => {
    await page.goto(`/?screen=exercise-pilot&state=${state}`);
    await expect(page.getByRole("alert")).toContainText("Impossible de charger le catalogue");
    await expect(page.getByText("0 fiches trouvées sur 15", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Résultats du catalogue", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Réessayer le chargement du catalogue", exact: true })).toBeVisible();
  });
}

test("a network failure can be retried without any write", async ({ page }) => {
  await page.goto("/?screen=exercise-pilot&state=pilot-response-recovery");
  await expect(page.getByRole("alert")).toContainText("Impossible de charger le catalogue");
  await page.getByRole("button", { name: "Réessayer le chargement du catalogue", exact: true }).click();
  await expect(page.getByText("15 fiches trouvées sur 15", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __exerciseRequests: unknown[] }).__exerciseRequests)).toEqual([]);
});
