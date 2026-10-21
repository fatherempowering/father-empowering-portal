import { expect, test, type Page } from "@playwright/test";

async function openStep(page: Page, name: RegExp) {
  await expect(page.getByRole("navigation", { name: /Étapes de la semaine zéro|Week Zero steps/ })).toBeVisible();
  const toggle = page.getByRole("button", { name: /Voir les étapes|View steps/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name }).click();
}

for (const language of ["fr", "en"] as const) {
  test(`Week Zero acquisition exposes seven factual steps and data progress in ${language}`, async ({ page }) => {
    const french = language === "fr";
    await page.goto(`/?screen=client-week-zero&language=${language}`);
    await expect(page.getByRole("progressbar", { name: french ? /Progression de la semaine zéro/ : /Week Zero progress/ })).toHaveAttribute("value", "0");
    const navigation = page.getByRole("navigation", { name: french ? /Étapes de la semaine zéro/ : /Week Zero steps/ });
    const toggle = navigation.getByRole("button", { name: french ? /Voir les étapes/ : /View steps/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(navigation.locator("#week-zero-steps").getByRole("button")).toHaveCount(7);
    await expect(navigation.getByRole("button", { name: french ? "1. Directives" : "1. Instructions", exact: true })).toHaveAttribute("aria-current", "step");
    await expect(page.getByText(french ? /2 à 4 répétitions en réserve/ : /2 to 4 repetitions in reserve/)).toBeVisible();
    await expect(page.getByText(french ? /test d’effort distinct/ : /separate effort test/)).toBeVisible();

    const acceptance = page.getByRole("checkbox", { name: french ? /J’ai lu les directives/ : /I have read the instructions/ });
    await acceptance.check();
    await expect(page.locator('[data-state="dirty"]')).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");

    await openStep(page, french ? /6\. Mobilité/ : /6\. Mobility/);
    await expect(page.getByText(french ? /après ta séance de gym/ : /after your gym session/)).toBeVisible();
    await expect(page.locator("video, iframe")).toHaveCount(0);
  });
}

test("Week Zero only confirms a photo after the private upload response", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /2\. Photos/);
  const card = page.getByRole("heading", { name: "Face", exact: true }).locator("..");
  await expect(card).toHaveAttribute("data-photo-status", "missing");
  await page.getByTestId("photo-front").setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await expect(card).toHaveAttribute("data-photo-status", "uploaded");
  await expect(card.getByText("Enregistrée dans l’espace privé", { exact: true })).toBeVisible();
});

test("Week Zero photo failure blocks edits until an idempotent retry and never shows a false success", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=acquisition-photo-error");
  await openStep(page, /2\. Photos/);
  const card = page.getByRole("heading", { name: "Face", exact: true }).locator("..");
  await page.getByTestId("photo-front").setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await expect(page.getByText(/La confirmation n’a pas été reçue/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer l’envoi de la photo", exact: true })).toBeEnabled();
  await expect(card).toHaveAttribute("data-photo-status", "missing");
  await openStep(page, /3\. Mesures/);
  await expect(page.getByLabel(/Poids au réveil/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true })).toBeDisabled();
  await expect(page.getByLabel(/Poids au réveil/)).toHaveValue("");
});

test("a definitive photo rejection unlocks the form for a replacement file", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=acquisition-photo-rejected");
  await openStep(page, /2\. Photos/);
  const card = page.getByRole("heading", { name: "Face", exact: true }).locator("..");
  const input = page.getByTestId("photo-front");
  await input.setInputFiles({
    name: "rejected.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await expect(page.getByText(/Vérifie les valeurs, le format des photos/)).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(page.getByRole("button", { name: "Réessayer l’envoi de la photo", exact: true })).toHaveCount(0);

  await input.setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await expect(card).toHaveAttribute("data-photo-status", "uploaded");
});

test("Week Zero calibration requires all eight explicit results and skip reasons", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /4\. Calibration/);
  await expect(page.locator('[data-testid^="calibration-"]')).toHaveCount(8);
  const squat = page.getByTestId("calibration-squat");
  await squat.getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("NOT_PERFORMED");
  await squat.getByRole("textbox", { name: /Raison/ }).fill("Équipement non disponible.");
  await expect(squat).toHaveAttribute("data-complete", "true");

  const deadlift = page.getByTestId("calibration-deadlift");
  await deadlift.getByRole("combobox", { name: /Résultat — Soulevé de terre/ }).selectOption("DONE");
  await deadlift.getByLabel("Variante utilisée *").selectOption("DUMBBELL_DEADLIFT");
  await expect(deadlift.getByLabel("Charge indiquée *").locator("option:not([value=''])")).toHaveCount(1);
  await deadlift.getByLabel("Charge indiquée *").selectOption("PER_HAND");
  await deadlift.getByLabel("Charge *").fill("55");
  await deadlift.getByLabel("Unité *").selectOption("LB");
  await deadlift.getByLabel("Répétitions *").fill("8");
  await expect(deadlift).toHaveAttribute("data-complete", "true");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
});

test("partial and out-of-range entries stay drafts and never turn progress green", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /4\. Calibration/);
  await page.getByTestId("calibration-squat").getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("DONE");
  await expect(page.locator("form")).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="draft"]')).toBeVisible();
  await expect(page.getByTestId("calibration-squat")).toHaveAttribute("data-complete", "false");

  await page.goto("/?screen=client-week-zero");
  await openStep(page, /3\. Mesures/);
  await page.getByLabel(/Poids au réveil/).fill("-1");
  await page.getByLabel(/Tour de taille/).fill("38");
  await expect(page.getByTestId("week-zero-step-3")).toHaveAttribute("data-complete", "false");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");

  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="dirty"]')).toBeVisible();
  await expect(page.getByText(/Vérifie les valeurs/)).toBeVisible();

  await openStep(page, /5\. Cardio Concept2/);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40.5");
  await page.getByLabel(/Poids lors du test/).fill("90");
  await page.getByLabel(/Sexe de référence/).selectOption("MALE");
  await page.getByLabel(/Niveau d’entraînement/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("8");
  await page.getByLabel(/Temps — secondes/).fill("0");
  await expect(page.getByTestId("week-zero-step-5")).toHaveAttribute("data-complete", "false");

  await openStep(page, /4\. Calibration/);
  const squat = page.getByTestId("calibration-squat");
  await squat.getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("DONE");
  await squat.getByLabel("Variante utilisée *").selectOption("BARBELL_SQUAT");
  await squat.getByLabel("Charge indiquée *").selectOption("TOTAL");
  await squat.getByLabel("Charge *").fill("135");
  await squat.getByLabel("Unité *").selectOption("LB");
  await squat.getByLabel("Répétitions *").fill("1.5");
  await expect(squat).toHaveAttribute("data-complete", "false");
  await expect(page.getByTestId("week-zero-step-4")).toHaveAttribute("data-complete", "false");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
});

test("a saved cardio estimate disappears after any input change until the new result is saved", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /5\. Cardio Concept2/);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40");
  await page.getByLabel(/Poids lors du test/).fill("90");
  await page.getByLabel(/Sexe de référence/).selectOption("MALE");
  await page.getByLabel(/Niveau d’entraînement/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("8");
  await page.getByLabel(/Temps — secondes/).fill("0");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estimation après enregistrement" })).toBeVisible();

  await page.getByLabel(/Poids lors du test/).fill("95");
  await expect(page.getByRole("heading", { name: "Estimation après enregistrement" })).toHaveCount(0);
  await openStep(page, /7\. Vérifier et transmettre/);
  await expect(page.getByText("Puissance moyenne", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Homme · Pas très entraîné en aviron", { exact: true })).toBeVisible();
  await expect(page.getByText("MALE", { exact: true })).toHaveCount(0);

  await openStep(page, /5\. Cardio Concept2/);
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estimation après enregistrement" })).toBeVisible();
  await expect(page.getByText(/ml\/kg\/min/)).toBeVisible();
  await page.getByLabel(/Résultat du test/).selectOption("NOT_PERFORMED");
  await expect(page.getByRole("heading", { name: "Estimation après enregistrement" })).toHaveCount(0);
});

test("a submitted V1 assessment remains an archive and does not complete the new flow", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=legacy-assessment-submitted");
  await expect(page.locator('[data-state="not_started"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  const archive = page.getByText("Archive — bilan initial V1", { exact: true });
  await expect(archive).toBeVisible();
  await archive.click();
  await expect(page.getByText("Anciennes disponibilités", { exact: true })).toBeVisible();
  await expect(page.locator('[data-state="submitted"]')).toHaveCount(0);
});

test("a submitted acquisition is read-only and names every not-performed result", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=acquisition-submitted");
  await expect(page.locator('[data-state="submitted"]')).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText("Calibration — 8 mouvements", { exact: true })).toBeVisible();
  await expect(page.locator('[data-result="NOT_PERFORMED"]')).toHaveCount(9);
  await expect(page.getByText(/Non réalisé — Non réalisé — exemple de démonstration/).first()).toBeVisible();
});

test("Week Zero reflows at 390 and 320 without browser storage", async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 820 });
    await page.goto("/?screen=client-week-zero&state=acquisition-draft");
    await expect(page.getByRole("heading", { name: "Ta semaine zéro" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  }
});
