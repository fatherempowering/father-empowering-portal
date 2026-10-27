import { expect, test, type Page } from "@playwright/test";

test("a photo can be dropped into its own frame without completing other sections", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /2\. Photos/);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "drop.png", { type: "image/png" }));
    return data;
  });
  const card = page.getByTestId("photo-back").locator("../..");
  await card.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(card).toHaveAttribute("data-photo-status", "uploaded");
  await transfer.dispose();
});

test("confirmed submission returns directly to Client home, but a failure keeps answers", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=acquisition-submit-error");
  await openStep(page, /7\. Relire et envoyer/);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Envoyer ma semaine zéro", exact: true }).click();
  await expect(page.getByText(/On n’a pas reçu la confirmation/)).toBeVisible();
  await expect(page).toHaveURL(/screen=client-week-zero/);
  await expect(page.getByText("198.5", { exact: true })).toBeVisible();
  await page.goto("/?screen=client-week-zero&state=acquisition-ready-to-submit");
  await openStep(page, /7\. Relire et envoyer/);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Envoyer ma semaine zéro", exact: true }).click();
  await expect(page).toHaveURL(/\/client\?weekZero=submitted$/);
  await expect(page.getByRole("heading", { name: "Ton parcours commence ici." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Clients/ })).toHaveCount(0);
});

test("photos remain independent of invalid unsaved measurements and keep those edits", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /3\. Mesures/);
  await page.getByRole("spinbutton", { name: /Poids au réveil/ }).fill("-1");
  await page.getByRole("spinbutton", { name: /Bras gauche fléchi/ }).fill("14.25");
  await page.getByLabel(/Une précision à ajouter/).fill("Keep this unfinished entry");
  await openStep(page, /2\. Photos/);
  for (const slot of ["front", "side", "back"]) {
    await page.getByTestId(`photo-${slot}`).setInputFiles({
      name: `${slot}.png`, mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await expect(page.getByTestId(`photo-${slot}`).locator("../..")).toHaveAttribute("data-photo-status", "uploaded");
  }
  await openStep(page, /3\. Mesures/);
  await expect(page.getByRole("spinbutton", { name: /Poids au réveil/ })).toHaveValue("-1");
  await expect(page.getByRole("spinbutton", { name: /Bras gauche fléchi/ })).toHaveValue("14.25");
  await expect(page.getByLabel(/Une précision à ajouter/)).toHaveValue("Keep this unfinished entry");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.getByText(/Vérifie les valeurs/)).toBeVisible();
  await page.getByRole("spinbutton", { name: /Poids au réveil/ }).fill("195");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="draft"]')).toBeVisible();
  await openStep(page, /2\. Photos/);
  await expect(page.locator('[data-photo-status="uploaded"]')).toHaveCount(3);
});

test("missing-field actions open the correct step and focus the exact control", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /7\. Relire et envoyer/);
  await page.getByRole("button", { name: /Photos — Profil/ }).click();
  await expect(page.getByTestId("photo-side")).toBeFocused();
  await openStep(page, /7\. Relire et envoyer/);
  await page.getByRole("button", { name: /Mesures — Poids au réveil/ }).click();
  await expect(page.getByRole("spinbutton", { name: /Poids au réveil/ })).toBeFocused();
  await openStep(page, /7\. Relire et envoyer/);
  await page.getByRole("button", { name: /Squat — résultat/ }).click();
  await expect(page.getByTestId("calibration-squat").getByLabel(/Résultat — Squat/)).toBeFocused();
});

test("left and right measurements expose keyboard-accessible instructions and privacy stays in Photos", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await expect(page.getByText(/Tes photos restent privées/)).toHaveCount(0);
  await openStep(page, /3\. Mesures/);
  for (const label of [/Bras gauche fléchi/, /Bras droit fléchi/, /Mollet gauche/, /Mollet droit/]) {
    await expect(page.getByRole("spinbutton", { name: label })).toBeVisible();
  }
  const help = page.locator("summary").filter({ hasText: "i" }).first();
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Pèse-toi au réveil, après être allé/)).toBeVisible();
  await openStep(page, /2\. Photos/);
  await expect(page.getByText(/Tes photos restent privées/)).toBeVisible();
});

test("calibration defaults to pounds, derives its load basis and displays zero for bodyweight", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /4\. Charges de départ/);
  const press = page.getByTestId("calibration-horizontalPress");
  await press.getByLabel(/Résultat/).selectOption("DONE");
  await press.getByLabel(/Version de l’exercice utilisée/).selectOption("DUMBBELL_PRESS");
  await expect(press.locator("legend")).toHaveText(/Développé couché avec haltères/);
  await expect(press.getByLabel("Unité *")).toHaveValue("LB");
  await expect(press.getByLabel("Charge indiquée *")).toHaveCount(0);
  await press.getByLabel("Charge *", { exact: true }).fill("25");
  await press.getByLabel("Unité *").selectOption("KG");
  await press.getByLabel(/Répétitions/).fill("8");
  await expect(press).toHaveAttribute("data-complete", "true");
  const pullUps = page.getByTestId("calibration-pullUps");
  await pullUps.getByLabel(/Résultat/).selectOption("DONE");
  await expect(pullUps.getByLabel(/Version de l’exercice utilisée/)).toHaveValue("PULL_UPS");
  await expect(pullUps.getByLabel("Charge *", { exact: true })).toHaveValue("0");
  await pullUps.getByLabel(/Répétitions/).fill("5");
  await expect(pullUps).toHaveAttribute("data-complete", "true");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="draft"]')).toBeVisible();
});

test("cardio calculates live independently of self-assessment and rejects invalid time parts", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /5\. Cardio/);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40");
  await page.getByLabel(/Poids lors du test/).fill("90");
  await page.getByLabel(/Sexe utilisé pour le calcul/).selectOption("MALE");
  await page.getByLabel(/Profil d’entraînement en aviron/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("7");
  await page.getByLabel(/Temps — secondes/).fill("30");
  await expect(page.getByTestId("cardio-estimate")).toContainText("43.9 mL/kg/min");
  for (const value of ["EXCELLENT", "GOOD", "POOR", "NONE"]) {
    await page.getByLabel(/ton autoévaluation/).selectOption(value);
    await expect(page.getByTestId("cardio-estimate")).toContainText("43.9 mL/kg/min");
  }
  await page.getByLabel(/Temps — secondes/).fill("75");
  await expect(page.getByLabel(/Temps — minutes/)).toHaveValue("7");
  await expect(page.getByTestId("cardio-estimate")).toHaveCount(0);
  await expect(page.getByTestId("week-zero-step-5")).toHaveAttribute("data-complete", "false");
  await page.getByLabel(/Temps — secondes/).fill("30");
  await page.getByLabel(/Âge lors du test/).fill("75");
  await expect(page.getByTestId("cardio-estimate")).toContainText("ne permet pas de classement");
});

test("Client home links stay in Client and a query alone cannot claim submission", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Accueil", exact: true }).click();
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { name: "Ton parcours commence ici." })).toBeVisible();
  await page.goto("/client?weekZero=submitted");
  await expect(page.getByRole("heading", { name: "Ton parcours commence ici." })).toBeVisible();
  await expect(page.getByText(/Une vraie étape de franchie/)).toHaveCount(0);
  await page.goto("/client?weekZero=submitted&state=acquisition-submitted");
  await expect(page.getByText(/Une vraie étape de franchie/)).toBeVisible();
  await page.getByRole("button", { name: "C’est noté", exact: true }).click();
  await expect(page.getByText(/Une vraie étape de franchie/)).toHaveCount(0);
});

test("Concept2 and measurement inputs fit narrow mobile screens", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?screen=client-week-zero");
    await openStep(page, /3\. Mesures/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await openStep(page, /5\. Cardio/);
    await page.getByLabel(/Résultat du test/).selectOption("DONE");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const minutes = await page.getByLabel(/Temps — minutes/).boundingBox();
    const seconds = await page.getByLabel(/Temps — secondes/).boundingBox();
    expect(minutes?.y).toBe(seconds?.y);
  }
});

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
    await expect(page.getByText(french ? /Concept2 se fait à part/ : /cardio test is a separate effort/)).toBeVisible();

    const acceptance = page.getByRole("checkbox", { name: french ? /J’ai lu ces consignes/ : /I have read these instructions/ });
    await acceptance.check();
    await expect(page.locator('[data-state="dirty"]')).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");

    await openStep(page, french ? /6\. Mobilité/ : /6\. Mobility/);
    await expect(page.getByText(french ? /Après ta séance de gym/ : /After your gym session/)).toBeVisible();
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
  await expect(card.getByText("Photo enregistrée en privé", { exact: true })).toBeVisible();
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
  await expect(page.getByText(/On n’a pas reçu la confirmation/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer l’envoi de la photo", exact: true })).toBeEnabled();
  await expect(card).toHaveAttribute("data-photo-status", "missing");
  await openStep(page, /3\. Mesures/);
  await expect(page.getByRole("spinbutton", { name: /Poids au réveil/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: /Poids au réveil/ })).toHaveValue("");
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
  await openStep(page, /4\. Charges de départ/);
  await expect(page.locator('[data-testid^="calibration-"]')).toHaveCount(8);
  const squat = page.getByTestId("calibration-squat");
  await squat.getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("NOT_PERFORMED");
  await squat.getByRole("textbox", { name: /Raison/ }).fill("Équipement non disponible.");
  await expect(squat).toHaveAttribute("data-complete", "true");

  const deadlift = page.getByTestId("calibration-deadlift");
  await deadlift.getByRole("combobox", { name: /Résultat — Soulevé de terre/ }).selectOption("DONE");
  await deadlift.getByLabel("Version de l’exercice utilisée *").selectOption("DUMBBELL_DEADLIFT");
  await expect(deadlift.getByLabel("Charge indiquée *")).toHaveCount(0);
  await deadlift.getByLabel("Charge *").fill("55");
  await deadlift.getByLabel("Unité *").selectOption("LB");
  await deadlift.getByLabel("Répétitions *").fill("8");
  await expect(deadlift).toHaveAttribute("data-complete", "true");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
});

test("partial and out-of-range entries stay drafts and never turn progress green", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /4\. Charges de départ/);
  await page.getByTestId("calibration-squat").getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("DONE");
  await expect(page.locator("form")).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="draft"]')).toBeVisible();
  await expect(page.getByTestId("calibration-squat")).toHaveAttribute("data-complete", "false");

  await page.goto("/?screen=client-week-zero");
  await openStep(page, /3\. Mesures/);
  await page.getByRole("spinbutton", { name: /Poids au réveil/ }).fill("-1");
  await page.getByRole("spinbutton", { name: /Tour de taille/ }).fill("38");
  await expect(page.getByTestId("week-zero-step-3")).toHaveAttribute("data-complete", "false");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");

  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.locator('[data-state="dirty"]')).toBeVisible();
  await expect(page.getByText(/Vérifie les valeurs/)).toBeVisible();

  await openStep(page, /5\. Cardio/);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40.5");
  await page.getByLabel(/Poids lors du test/).fill("90");
  await page.getByLabel(/Sexe utilisé pour le calcul/).selectOption("MALE");
  await page.getByLabel(/Profil d’entraînement en aviron/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("8");
  await page.getByLabel(/Temps — secondes/).fill("0");
  await expect(page.getByTestId("week-zero-step-5")).toHaveAttribute("data-complete", "false");

  await openStep(page, /4\. Charges de départ/);
  const squat = page.getByTestId("calibration-squat");
  await squat.getByRole("combobox", { name: /Résultat — Squat/ }).selectOption("DONE");
  await squat.getByLabel("Version de l’exercice utilisée *").selectOption("BARBELL_SQUAT");
  await squat.getByLabel("Charge *").fill("135");
  await squat.getByLabel("Unité *").selectOption("LB");
  await squat.getByLabel("Répétitions *").fill("1.5");
  await expect(squat).toHaveAttribute("data-complete", "false");
  await expect(page.getByTestId("week-zero-step-4")).toHaveAttribute("data-complete", "false");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
});

test("a live cardio estimate updates after any input change until the new result is saved", async ({ page }) => {
  await page.goto("/?screen=client-week-zero");
  await openStep(page, /5\. Cardio/);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40");
  await page.getByLabel(/Poids lors du test/).fill("90");
  await page.getByLabel(/Sexe utilisé pour le calcul/).selectOption("MALE");
  await page.getByLabel(/Profil d’entraînement en aviron/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("8");
  await page.getByLabel(/Temps — secondes/).fill("0");
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ton VO₂ max estimé" })).toBeVisible();

  await page.getByLabel(/Poids lors du test/).fill("95");
  await expect(page.getByTestId("cardio-estimate")).toContainText("36.8 mL/kg/min");
  await openStep(page, /7\. Relire et envoyer/);
  await expect(page.getByText("Puissance moyenne", { exact: true })).toBeVisible();
  await expect(page.getByText("Homme · Pas très entraîné en aviron", { exact: true })).toBeVisible();
  await expect(page.getByText("MALE", { exact: true })).toHaveCount(0);

  await openStep(page, /5\. Cardio/);
  await page.getByRole("button", { name: "Enregistrer mon brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ton VO₂ max estimé" })).toBeVisible();
  await expect(page.getByText(/mL\/kg\/min/)).toBeVisible();
  await page.getByLabel(/Résultat du test/).selectOption("NOT_PERFORMED");
  await expect(page.getByRole("heading", { name: "Ton VO₂ max estimé" })).toHaveCount(0);
});

test("a submitted V1 assessment remains an archive and does not complete the new flow", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=legacy-assessment-submitted");
  await expect(page.locator('[data-state="not_started"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  const archive = page.getByText("Ton ancien bilan", { exact: true });
  await expect(archive).toBeVisible();
  await archive.click();
  await expect(page.getByText("Anciennes disponibilités", { exact: true })).toBeVisible();
  await expect(page.locator('[data-state="submitted"]')).toHaveCount(0);
});

test("a submitted acquisition is read-only and names every not-performed result", async ({ page }) => {
  await page.goto("/?screen=client-week-zero&state=acquisition-submitted");
  await expect(page.locator('[data-state="submitted"]')).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText("Tes charges de départ — 8 mouvements", { exact: true })).toBeVisible();
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
