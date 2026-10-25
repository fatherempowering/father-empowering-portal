import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { checkInsResponseSchema, clientNutritionResponseSchema, coachCheckInsResponseSchema, coachNutritionResponseSchema, progressionResponseSchema } from "../../src/lib/contracts/client-followup";
import { getM1TestEnvironment, seedStaffIdentity } from "../harness/m1-local-supabase";
import { extractActivation, extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();

async function enterEmailCode(page: Page, email: string) {
  const mail = await waitForMail(environment.mailpitUrl, email, message => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  // Never let a failing fill include the ephemeral OTP in Playwright diagnostics.
  try { await page.getByRole("textbox", { name: /chiffre 1 sur 6/i }).fill(extractSixDigitOtp(mail)); }
  catch { throw new Error("Unable to enter the local follow-up email verification code"); }
}

test("verified Coach publishes Nutrition and receives only the Client submitted Check-in with honest progression", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const coach = await seedStaffIdentity(environment, {
    email: `followup.vertical.coach.${randomUUID()}@example.test`, password: "Followup-vertical-local!123", role: "COACH",
  });
  await page.goto(`${environment.appUrl}/coach`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel(/courriel|email/i).fill(coach.email);
  try { await page.getByLabel(/^mot de passe$/i).fill(coach.password); }
  catch { throw new Error("Unable to enter the synthetic follow-up Coach password"); }
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
  await enterEmailCode(page, coach.email);
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);

  const clientEmail = `followup.vertical.client.${randomUUID()}@example.test`;
  await page.getByRole("button", { name: /ajouter un client/i }).click();
  await page.getByLabel(/prénom/i).fill("Client");
  await page.getByLabel(/^nom$/i).fill("Suivi");
  await page.getByLabel(/courriel du client/i).fill(clientEmail);
  await page.getByRole("button", { name: /créer et inviter/i }).click();
  const invitation = await waitForMail(environment.mailpitUrl, clientEmail, message => /\/activate#token=/.test(`${message.text}\n${message.html}`));
  const clientContext = await browser.newContext();
  try {
    let clientPage = await clientContext.newPage();
    try { await clientPage.goto(extractActivation(environment.appUrl, invitation).url); }
    catch { throw new Error("Unable to open the disposable follow-up activation link"); }
    await clientPage.getByRole("button", { name: /envoyer mon code/i }).click();
    await enterEmailCode(clientPage, clientEmail);
    await clientPage.getByRole("button", { name: /activer mon portail/i }).click();
    await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
    const identity = await clientContext.request.get(`${environment.appUrl}/api/v1/client/me`);
    expect(identity.status()).toBe(200);
    const clientId = (await identity.json()).client.clientId as string;
    const followupUrl = `${environment.appUrl}/coach/clients/${clientId}/followup`;
    const nutritionApi = `/api/v1/coach/clients/${clientId}/nutrition`;

    await clientPage.goto(`${environment.appUrl}/client/nutrition?language=fr`);
    await expect(clientPage.getByRole("heading", { name: "Ton plan est en préparation.", exact: true })).toBeVisible();
    await page.goto(followupUrl);
    await expect(page.getByRole("heading", { name: "Nutrition et check-ins", exact: true })).toBeVisible();
    await page.getByRole("group", { name: /^Titre du plan/ }).getByRole("textbox", { name: "Français", exact: true }).fill("Nutrition verticale QA");
    await page.getByRole("button", { name: "+ Ajouter un repas", exact: true }).click();
    const meal = page.getByRole("region", { name: "Repas 1", exact: true });
    await meal.getByRole("group", { name: /^Nom du repas/ }).getByRole("textbox", { name: "Français", exact: true }).fill("Repas de test");
    await meal.getByRole("group", { name: /^Aliments et portions/ }).getByRole("textbox", { name: "Français", exact: true }).fill("Une portion fictive pour le test local.");
    const saving = page.waitForResponse(response => new URL(response.url()).pathname === nutritionApi && response.request().method() === "POST");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    const saved = await saving;
    expect(saved.status()).toBe(200);
    const snapshot = coachNutritionResponseSchema.parse((await saved.json()).data);
    expect(snapshot.draft?.version).toBe(1);
    expect(snapshot.publication).toBeNull();
    await clientPage.reload();
    await expect(clientPage.getByRole("heading", { name: "Ton plan est en préparation.", exact: true })).toBeVisible();
    const publishing = page.waitForResponse(response => new URL(response.url()).pathname === nutritionApi && response.request().method() === "POST");
    await page.getByRole("button", { name: "Publier le plan nutritionnel", exact: true }).click();
    await page.getByRole("dialog", { name: "Publier ce plan?", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    const published = await publishing;
    expect(published.status()).toBe(200);
    const publishedState = coachNutritionResponseSchema.parse((await published.json()).data);
    expect(publishedState.publication?.revision).toBe(1);
    await expect(page.getByText("Plan nutritionnel publié. Le client peut maintenant le consulter.", { exact: true })).toBeVisible();
    await clientPage.reload();
    await expect(clientPage.getByRole("heading", { name: "Nutrition verticale QA", exact: true })).toBeVisible();
    await expect(clientPage.getByText("Une portion fictive pour le test local.", { exact: true })).toBeVisible();
    const clientPlan = await clientContext.request.get(`${environment.appUrl}/api/v1/client/nutrition`);
    expect(clientPlan.status()).toBe(200);
    expect(clientNutritionResponseSchema.parse((await clientPlan.json()).data).publication?.document).toEqual(snapshot.draft!.document);

    await clientPage.getByRole("navigation", { name: "Navigation du portail", exact: true }).getByRole("link", { name: "Check-in", exact: true }).click();
    await expect(clientPage.getByRole("heading", { name: "Fais le point.", exact: true })).toBeVisible();
    await clientPage.getByLabel(/^Date des observations/).fill("2020-02-03");
    await clientPage.getByRole("spinbutton", { name: /^Poids \(lb\)/ }).fill("202.5");
    await clientPage.getByRole("spinbutton", { name: /^Sommeil \(heures\)/ }).fill("7.5");
    await clientPage.getByRole("spinbutton", { name: "Cardio (minutes)", exact: true }).fill("0");
    await clientPage.getByRole("textbox", { name: "Ta note pour ton coach", exact: true }).fill("Observation synthétique visible seulement après transmission.");
    const draftRequest = clientPage.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/client/check-ins" && response.request().method() === "POST");
    await clientPage.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    const draftResponse = await draftRequest;
    expect(draftResponse.status()).toBe(200);
    expect(checkInsResponseSchema.parse((await draftResponse.json()).data).draft?.version).toBe(1);
    await page.reload();
    await expect(page.getByText("Aucun check-in transmis pour le moment.", { exact: true })).toBeVisible();
    await expect(page.getByText("Observation synthétique visible seulement après transmission.", { exact: true })).toHaveCount(0);
    const privateProjection = await page.request.get(`${environment.appUrl}/api/v1/coach/clients/${clientId}/check-ins`);
    expect(privateProjection.status()).toBe(200);
    const privateProjectionBody = (await privateProjection.json()).data;
    expect(coachCheckInsResponseSchema.parse(privateProjectionBody).history).toHaveLength(0);
    expect(privateProjectionBody).not.toHaveProperty("draft");
    const beforeProgress = await clientContext.request.get(`${environment.appUrl}/api/v1/client/progression`);
    expect(beforeProgress.status()).toBe(200);
    expect(progressionResponseSchema.parse((await beforeProgress.json()).data).checkInsTotal).toBe(0);

    const submitting = clientPage.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/client/check-ins" && response.request().method() === "POST");
    await clientPage.getByRole("button", { name: "Transmettre à mon coach", exact: true }).click();
    const submitted = await submitting;
    expect(submitted.status()).toBe(200);
    const submission = checkInsResponseSchema.parse((await submitted.json()).data);
    expect(submission.draft).toBeNull();
    expect(submission.total).toBe(1);
    expect(submission.version).toBe(2);
    await expect(clientPage.getByText("Check-in transmis. Ton coach peut maintenant le consulter.", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByText("Observations du 2020-02-03", { exact: true }).click();
    await expect(page.getByText("Observation synthétique visible seulement après transmission.", { exact: true })).toBeVisible();
    await expect(page.getByText("202.5", { exact: true })).toBeVisible();
    await expect(page.getByText("7.5", { exact: true })).toBeVisible();

    await clientPage.getByRole("navigation", { name: "Navigation du portail", exact: true }).getByRole("link", { name: "Progression", exact: true }).click();
    await expect(clientPage.getByRole("heading", { name: "Regarde le chemin parcouru.", exact: true })).toBeVisible();
    await expect(clientPage.getByRole("heading", { name: "0 séances terminées", exact: true })).toBeVisible();
    await expect(clientPage.getByText("Un point de départ daté. Une seule mesure ne permet pas encore de décrire une tendance.", { exact: true })).toBeVisible();
    const progressRead = await clientContext.request.get(`${environment.appUrl}/api/v1/client/progression`);
    expect(progressRead.status()).toBe(200);
    const progression = progressionResponseSchema.parse((await progressRead.json()).data);
    expect(progression.checkInsTotal).toBe(1);
    expect(progression.checkIns[0].document.observedOn).toBe("2020-02-03");
    expect(progression.checkIns[0].document.measurements.bodyWeightLb).toBe(202.5);
    expect(progression.completedWorkouts.total).toBe(0);
    expect(progression.baseline).toBeNull();
    await clientPage.getByRole("button", { name: "English", exact: true }).click();
    await expect(clientPage.getByRole("heading", { name: "Look how far you’ve come.", exact: true })).toBeVisible();
    await clientPage.setViewportSize({ width: 390, height: 844 });
    expect(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    let otpRequests = 0;
    clientContext.on("request", request => { if (request.url().includes("/client-otp/request")) otpRequests++; });
    await clientPage.close();
    clientPage = await clientContext.newPage();
    await clientPage.goto(`${environment.appUrl}/client/progression?language=fr`);
    await expect(clientPage.getByRole("heading", { name: "Regarde le chemin parcouru.", exact: true })).toBeVisible();
    expect(otpRequests).toBe(0);
    await clientPage.getByRole("button", { name: "Se déconnecter", exact: true }).click();
    await expect(clientPage).toHaveURL(/\/client-login(?:\?.*)?$/);
    await clientPage.goto(`${environment.appUrl}/client/check-in`);
    await expect(clientPage).toHaveURL(/\/client-login(?:\?.*)?$/);
    // Client local logout never terminates the independent Coach browser session.
    expect((await page.request.get(`${environment.appUrl}/api/v1/coach/clients/${clientId}/nutrition`)).status()).toBe(200);
  } finally {
    await clientContext.close();
  }
});
