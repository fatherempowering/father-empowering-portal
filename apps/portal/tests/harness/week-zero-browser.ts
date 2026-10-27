import { expect, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { WEEK_ZERO_MOVEMENT_KEYS } from "@/lib/contracts/week-zero-acquisition";

async function step(page: Page, number: number) {
  const toggle = page.getByRole("button", { name: /Voir les étapes/i });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: new RegExp(`^${number}\\. `) }).click();
}

export async function verifyWeekZeroBrowserJourney(input: { clientPage: Page; coachPage: Page; context: BrowserContext; appUrl: string; clientId: string }) {
  const { clientPage: page, coachPage, context, appUrl, clientId } = input;
  await page.goto(`${appUrl}/client/week-zero`);
  await expect(page.getByRole("heading", { name: "Ta semaine zéro", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  await page.getByRole("checkbox", { name: /J’ai lu ces consignes/ }).check();
  await step(page, 3);
  await page.getByRole("spinbutton", { name: /Poids au réveil \(lb\)/ }).fill("214.5");
  await page.getByRole("spinbutton", { name: /Tour de taille au nombril \(po\)/ }).fill("41.25");
  await page.getByLabel(/Une précision à ajouter/).fill("Poids et tour de taille pris au réveil.");
  await page.getByRole("button", { name: /Enregistrer mon brouillon/ }).click();
  await expect(page.locator('[data-state="draft"]')).toBeVisible();
  await coachPage.goto(`${appUrl}/coach/clients/${clientId}`);
  await expect(coachPage.getByTestId("week-zero-acquisition-status")).toHaveText("Non transmise");
  await expect(coachPage.getByText(/pris au réveil/)).toHaveCount(0);
  await expect(coachPage.locator('img[src*="/week-zero/photos"]')).toHaveCount(0);
  await page.reload();
  await step(page, 3);
  await expect(page.getByRole("spinbutton", { name: /Poids au réveil \(lb\)/ })).toHaveValue("214.5");
  await expect(page.getByLabel(/Une précision à ajouter/)).toHaveValue("Poids et tour de taille pris au réveil.");
  await step(page, 7);
  await expect(page.getByRole("button", { name: "Envoyer ma semaine zéro", exact: true })).toBeDisabled();
  await step(page, 2);
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ef7116" } }).png().toBuffer();
  for (const slot of ["front", "side", "back"] as const) {
    const uploadResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/client/week-zero/photos") && response.request().method() === "POST");
    await page.getByTestId(`photo-${slot}`).setInputFiles({ name: `${slot}.png`, mimeType: "image/png", buffer: image });
    expect((await uploadResponse).status()).toBe(200);
    await expect(page.getByTestId(`photo-${slot}`).locator("../..")).toHaveAttribute("data-photo-status", "uploaded");
  }
  await coachPage.reload();
  await expect(coachPage.locator('img[src*="/week-zero/photos"]')).toHaveCount(0);
  await step(page, 4);
  for (const key of WEEK_ZERO_MOVEMENT_KEYS) {
    const card = page.getByTestId(`calibration-${key}`);
    const completed = key === "horizontalPress" || key === "legPress";
    await card.getByRole("combobox", { name: /^Résultat/ }).selectOption(completed ? "DONE" : "NOT_PERFORMED");
    if (!completed) { await card.getByRole("textbox", { name: /^Raison/ }).fill("Matériel indisponible pour ce mouvement."); continue; }
    await card.getByLabel(/Version de l’exercice utilisée/).selectOption(key === "horizontalPress" ? "DUMBBELL_PRESS" : "LEG_PRESS");
    await card.getByLabel(/^Charge \*/).fill(key === "horizontalPress" ? "20" : "100");
    await card.getByLabel(/^Unité/).selectOption("KG");
    await card.getByLabel(/^Répétitions/).fill("8");
    await card.getByLabel(/RIR/).fill("2");
  }
  await step(page, 5);
  await page.getByLabel(/Résultat du test/).selectOption("DONE");
  await page.getByLabel(/Âge lors du test/).fill("40");
  await page.getByLabel(/Poids lors du test \(kg\)/).fill("90");
  await page.getByLabel(/Sexe utilisé pour le calcul/).selectOption("MALE");
  await page.getByLabel(/Profil d’entraînement en aviron/).selectOption("NOT_HIGHLY_TRAINED");
  await page.getByLabel(/Temps — minutes/).fill("7");
  await page.getByLabel(/Temps — secondes/).fill("30");
  await step(page, 6);
  for (const label of [/Douleur pendant le squat/, /Douleur pendant la flexion/, /Douleur pendant une poussée/, /Douleur pendant un tirage/, /Douleur pendant le cardio/]) {
    await page.getByLabel(label).selectOption(label.source.includes("tirage") || label.source.includes("flexion") ? "NOT_PERFORMED" : "NO");
  }
  await page.getByLabel(/Mouvement le plus limité/).fill("Charnière de hanches limitée au lever.");
  await page.getByLabel(/Mouvement le plus confortable/).fill("Poussée horizontale.");
  await page.getByLabel(/Zone raide ou tendue/).fill("Ischio-jambier droit.");
  await step(page, 7);
  await expect(page.getByRole("button", { name: "Envoyer ma semaine zéro", exact: true })).toBeEnabled();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Envoyer ma semaine zéro", exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/client?weekZero=submitted`);
  await expect(page.getByText("Ta semaine zéro est envoyée. Une vraie étape de franchie.", { exact: true })).toBeVisible();
  await page.goto(`${appUrl}/client/week-zero`);
  await expect(page.locator('[data-state="submitted"]')).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);

  const persisted = await context.request.get(`${appUrl}/api/v1/client/week-zero/acquisition`);
  expect(persisted.status()).toBe(200);
  expect(persisted.headers()["cache-control"]).toContain("no-store");
  const body = await persisted.json();
  expect(body).toMatchObject({ data: { acquisition: { status: "SUBMITTED", responses: {
    measurements: { bodyWeightLb: 214.5, waistIn: 41.25 },
    loads: { legPress: { status: "DONE", load: 100, unit: "KG", reps: 8 }, squat: { status: "NOT_PERFORMED", reason: "Matériel indisponible pour ce mouvement." } },
    cardio: { status: "DONE", totalSeconds: 450 },
  } } } });
  expect(body.data.acquisition.derived.cardio.estimatedVo2MaxMlKgMin).toBeCloseTo(43.8888889, 5);
  expect(await (await context.request.get(`${appUrl}/api/v1/client/week-zero`)).json()).toMatchObject({ data: { assessment: { status: "NOT_STARTED", version: 0 } } });
  await coachPage.reload();
  await expect(coachPage.getByTestId("week-zero-acquisition-status")).toHaveText("Transmise avec éléments non réalisés");
  await expect(coachPage.getByTestId("acquisition-measurements")).toContainText("214.5 lb");
  await expect(coachPage.getByTestId("acquisition-legPress")).toContainText("100 kg au total");
  await expect(coachPage.getByTestId("acquisition-cardio")).toContainText("43.9 mL/kg/min");
  await expect(coachPage.getByTestId("acquisition-mobility")).toContainText("Charnière de hanches limitée au lever.");
  const photos = coachPage.locator('img[src*="/week-zero/photos"]');
  await expect(photos).toHaveCount(3);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toHaveJSProperty("complete", true);
    expect(await photo.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
}
