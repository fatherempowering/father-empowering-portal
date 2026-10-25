import { expect, test, type Page } from "@playwright/test";

async function checkin(page: Page, state = "followup-empty") {
  await page.goto(`/?screen=client-check-in&state=${state}`);
  await expect(page.locator("#checkin-observedOn")).toBeVisible();
}
async function fillMinimum(page: Page) {
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.locator("#checkin-measurements-bodyWeightLb").fill("180");
  await page.locator("#checkin-sleepHours").fill("7");
}
const commands = (page: Page) => page.evaluate(() => (window as unknown as { __followupCommands: { action: string; expectedVersion: number; clientMutationId: string; document?: { measurements: { bodyWeightLb: number; leftArmIn: number }; energy: number | null; sleepQuality: number | null } }[] }).__followupCommands);

test("Nutrition presents only prescribed content, versions and actual preparation", async ({ page }, info) => {
  await page.goto("/?screen=client-nutrition&state=followup-filled");
  await expect(page.getByRole("heading", { name: "Ton plan nutritionnel." })).toBeVisible();
  await expect(page.getByText("Poulet : 150 g cuits", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cibles prescrites" })).toContainText("Non renseignée");
  await expect(page.getByText("Ces valeurs sont prescrites", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Préparation", exact: true }).click();
  await expect(page.getByText("Prépare les aliments indiqués dans les repas.", { exact: true })).toBeVisible();
  await page.getByLabel("Version du plan").selectOption({ label: "V1 · 1 oct. 2026" });
  await expect(page.getByText("Version précédente · consultation uniquement.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actualiser le plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ancien plan", exact: true })).toBeVisible();
  await page.getByLabel("Version du plan").selectOption({ index: 0 });
  await page.screenshot({ path: info.outputPath("nutrition.png"), fullPage: true });
});

test("Nutrition never invents meal prep, groceries or an unpublished plan", async ({ page }) => {
  await page.goto("/?screen=client-nutrition&state=followup-absent-sections");
  await expect(page.getByRole("heading", { name: "Ton plan nutritionnel." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Préparation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Épicerie", exact: true })).toHaveCount(0);
  await page.goto("/?screen=client-nutrition&state=followup-empty");
  await expect(page.getByRole("heading", { name: "Ton plan est en préparation." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cibles prescrites" })).toHaveCount(0);
});

for (const screen of ["client-nutrition", "client-check-in", "client-progression"]) test(`${screen} offers retry after a failed read and does not claim success`, async ({ page }) => {
  await page.goto(`/?screen=${screen}&state=followup-error-once`);
  await expect(page.getByRole("alert")).toContainText("n’ont pas pu être chargées");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("Check-in starts empty, focuses validation and requires weight and sleep only on submission", async ({ page }) => {
  await checkin(page);
  await expect(page.locator("#checkin-observedOn")).toHaveValue("");
  await expect(page.locator("#checkin-energy")).toHaveValue("");
  await expect(page.locator("#checkin-sleepQuality")).toHaveValue("");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Date des observations — complète ou corrige ce champ →", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Date des observations — complète ou corrige ce champ →", exact: true }).click();
  await expect(page.locator("#checkin-observedOn")).toBeFocused();
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  await page.getByRole("button", { name: "Transmettre à mon coach", exact: true }).click();
  await page.getByRole("button", { name: "Poids — complète ou corrige ce champ →", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toBeFocused();
  expect((await commands(page)).map(item => item.action)).toEqual(["save"]);
});

test("Check-in saves canonical units, submits immutable history and preserves monotone version", async ({ page }, info) => {
  await checkin(page); await fillMinimum(page);
  await page.getByLabel("Unités de saisie").selectOption("metric");
  await page.locator("#checkin-measurements-bodyWeightLb").fill("81.6466266");
  await page.locator("#checkin-measurements-leftArmIn").fill("35.56");
  await page.locator("#checkin-cardioMinutes").fill("0");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  let sent = await commands(page); expect(sent[0].document?.measurements.bodyWeightLb).toBeCloseTo(180, 4); expect(sent[0].document?.measurements.leftArmIn).toBeCloseTo(14, 4); expect(sent[0].document?.energy).toBeNull();
  await page.getByRole("button", { name: "Transmettre à mon coach", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check-in transmis");
  const history = page.getByRole("region", { name: "Mes check-ins transmis (1)" });
  await history.getByRole("button", { name: /Consulter/ }).click();
  const record = page.getByRole("region", { name: "Check-in transmis — lecture seule" });
  await expect(record).toContainText("35,56 cm"); await expect(record.locator("input")).toHaveCount(0);
  await expect(record.locator("dl > div").filter({ hasText: "Cardio (minutes)" })).toHaveText("Cardio (minutes)0");
  await page.screenshot({ path: info.outputPath("check-in.png"), fullPage: true });
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  sent = await commands(page); expect(sent.map(item => item.expectedVersion)).toEqual([0, 1, 2]);
});

test("uncertain save is locked and retries the same operation without duplicate", async ({ page }) => {
  await checkin(page, "followup-response-lost"); await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("La confirmation n’est pas arrivée");
  await expect(page.locator("#checkin-observedOn")).toBeDisabled();
  await page.getByRole("button", { name: "Réessayer pour confirmer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  const sent = await commands(page); expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]);
});

test("conflict preserves entries until the user explicitly accepts reloading", async ({ page }) => {
  await checkin(page, "followup-conflict"); await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ce brouillon a changé ailleurs");
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("");
});

test("history pagination does not overwrite an unsaved check-in", async ({ page }) => {
  await checkin(page, "followup-many"); await fillMinimum(page);
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  await expect(page.getByRole("region", { name: "Mes check-ins transmis (53)" }).getByRole("button", { name: /Consulter/ })).toHaveCount(3);
});

test("Progression distinguishes no data, a single reference and multiple dated observations", async ({ page }, info) => {
  await page.goto("/?screen=client-progression&state=followup-empty");
  await expect(page.getByText("Pas encore de mesure de poids enregistrée.", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Courbe de poids/ })).toHaveCount(0);
  await page.goto("/?screen=client-progression&state=followup-single");
  await expect(page.getByText("Une seule mesure ne permet pas", { exact: false })).toBeVisible();
  await expect(page.getByText("Semaine zéro transmise le", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Courbe de poids/ })).toHaveCount(0);
  await page.goto("/?screen=client-progression&state=followup-filled");
  await expect(page.getByRole("heading", { name: "18 séances terminées", exact: true })).toBeVisible();
  const chart = page.getByRole("img", { name: /Courbe de poids/ }); await expect(chart).toBeVisible();
  await expect(chart.locator("path[stroke='#FF7A1A']")).toHaveCount(1);
  await page.getByText("Voir les valeurs", { exact: false }).click();
  await expect(page.getByRole("table")).toContainText("190 lb"); await expect(page.getByRole("table")).toContainText("180 lb");
  await page.getByText("Comment lire ces données", { exact: true }).click();
  await expect(page.getByText("pas d’une date de mensuration certaine", { exact: false })).toBeVisible();
  await page.getByLabel("Unités d’affichage").selectOption("metric");
  await expect(page.getByRole("table")).toContainText("81,65 kg");
  await page.screenshot({ path: info.outputPath("progression.png"), fullPage: true });
});

for (const screen of ["client-nutrition", "client-check-in", "client-progression"]) test(`${screen} remains readable at 320px and 200% text with keyboard language access`, async ({ page }, info) => {
  await page.goto(`/?screen=${screen}&state=followup-filled`);
  const language = page.getByRole("button", { name: "English", exact: true });
  await language.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(`[data-followup]`)).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Français", exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = await language.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: info.outputPath(`${screen}-320.png`), fullPage: true });
  await page.locator("html").evaluate(element => { element.style.fontSize = "32px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
