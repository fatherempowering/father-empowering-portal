import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { exercisePilotListSchema } from "../../src/lib/contracts/exercise-pilot";
import { exerciseSnapshotSchema } from "../../src/lib/contracts/training";
import { programSnapshotSchema } from "../../src/lib/contracts/training-drafts";
import { publicationResponseSchema } from "../../src/lib/contracts/training-publication";
import { workoutSessionResponseSchema } from "../../src/lib/contracts/training-results";
import { addLibraryExercise } from "../../src/lib/training/program-editor";
import { PILOT_IDS } from "../../src/lib/training/pilot/model";
import { createM1AdminClient, getM1TestEnvironment, seedStaffIdentity } from "../harness/m1-local-supabase";
import { extractActivation, extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const originHeaders = { Origin: environment.appUrl };

async function enterEmailCode(page: Page, email: string) {
  const mail = await waitForMail(environment.mailpitUrl, email, (message) => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  // Playwright traces/screenshots are disabled. Replace a failed fill error so
  // the ephemeral OTP can never become part of the printed call arguments.
  try { await page.getByRole("textbox", { name: /chiffre 1 sur 6/i }).fill(extractSixDigitOtp(mail)); }
  catch { throw new Error("Unable to enter the local test email verification code"); }
}

function firstSet(page: Page, name: string): Locator {
  return page.getByRole("article", { name, exact: true }).getByRole("region", { name: / · série 1$/ });
}

test("verified Coach preserves fifteen pilots, adds catalogue mobility, publishes to an OTP Client and persists honest results", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const password = "Pilot-local-test-only!123";
  const coach = await seedStaffIdentity(environment, {
    email: `pilot.coach.${randomUUID()}@example.test`, password, role: "COACH",
  });
  const admin = createM1AdminClient(environment);
  await page.goto(`${environment.appUrl}/coach/programs`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel(/courriel|email/i).fill(coach.email);
  try { await page.getByLabel(/^mot de passe$/i).fill(password); }
  catch { throw new Error("Unable to enter the synthetic Coach password"); }
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
  await enterEmailCode(page, coach.email);
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);

  const disabled = await page.request.post(`${environment.appUrl}/api/v1/coach/exercise-pilot/select`, {
    headers: originHeaders, data: { sourceId: "DB_034", sourceVersion: "1.2.0", clientMutationId: randomUUID() },
  });
  expect(disabled.status()).toBe(503);
  const provisioned = await admin.rpc("provision_training_pilot_test_access", {
    p_organization_id: coach.organizationId, p_client_id: null,
  });
  if (provisioned.error) throw new Error("Unable to enable the disposable local pilot organization");

  const clientEmail = `pilot.client.${randomUUID()}@example.test`;
  await page.getByRole("button", { name: /ajouter un client/i }).click();
  await page.getByLabel(/prénom/i).fill("Client");
  await page.getByLabel(/^nom$/i).fill("Pilote");
  await page.getByLabel(/courriel du client/i).fill(clientEmail);
  await page.getByRole("button", { name: /créer et inviter/i }).click();
  const invitation = await waitForMail(environment.mailpitUrl, clientEmail, (message) => /\/activate#token=/.test(`${message.text}\n${message.html}`));
  const clientContext = await browser.newContext();
  try {
    let clientPage = await clientContext.newPage();
    try { await clientPage.goto(extractActivation(environment.appUrl, invitation).url); }
    catch { throw new Error("Unable to open the local test activation link"); }
    await clientPage.getByRole("button", { name: /envoyer mon code/i }).click();
    await enterEmailCode(clientPage, clientEmail);
    await clientPage.getByRole("button", { name: /activer mon portail/i }).click();
    await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
    const identity = await clientContext.request.get(`${environment.appUrl}/api/v1/client/me`);
    expect(identity.status()).toBe(200);
    const clientId = (await identity.json()).client.clientId as string;
    const provisionedClient = await admin.rpc("provision_training_pilot_test_access", {
      p_organization_id: coach.organizationId, p_client_id: clientId,
    });
    if (provisionedClient.error) throw new Error("Unable to approve the disposable local pilot recipient");

    const deniedClientSelection = await clientContext.request.post(`${environment.appUrl}/api/v1/coach/exercise-pilot/select`, {
      headers: originHeaders, data: { sourceId: "DB_034", sourceVersion: "1.2.0", clientMutationId: randomUUID() },
    });
    expect(deniedClientSelection.status()).toBe(403);
    expect((await clientContext.request.get(`${environment.appUrl}/api/v1/coach/exercise-pilot`)).status()).toBe(403);

    // At least one selection crosses the actual dialog, guarded HTTP route and
    // database RPC. The remaining selections use the same Coach cookie session.
    await page.goto(`${environment.appUrl}/coach/programs`);
    await page.getByLabel("Titre du programme · français", { exact: true }).fill("Semaine pilote E2E");
    await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
    await page.getByLabel("Titre de la séance · français", { exact: true }).fill("Séance pilote et mobilité");
    await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
    await page.getByRole("button", { name: "Ajouter un exercice", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Choisir un exercice", exact: true });
    await picker.getByRole("searchbox", { name: "Rechercher un exercice", exact: true }).fill("DB_034");
    await picker.getByRole("button", { name: "Rechercher", exact: true }).click();
    await picker.getByRole("button", { name: "Consulter Curl alterné avec haltères", exact: true }).click();
    await picker.getByRole("button", { name: "Ajouter Curl alterné avec haltères à la séance", exact: true }).click();
    await expect(picker).toHaveCount(0);
    const curlEditor = page.getByRole("article", { name: "Exercice 1", exact: true });
    await expect(curlEditor.getByText("Répétitions par bras", { exact: true }).first()).toBeVisible();
    await curlEditor.getByLabel("Nombre de séries", { exact: true }).fill("1");
    await curlEditor.getByLabel("Répétitions", { exact: true }).fill("8");
    await curlEditor.getByLabel("Charge cible", { exact: true }).fill("12 lb par haltère");
    const firstSave = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/coach/programs" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    const initialSave = await firstSave;
    expect(initialSave.status()).toBe(200);
    const initial = programSnapshotSchema.parse((await initialSave.json()).data.program);
    await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.", { exact: true })).toBeVisible();
    const document = structuredClone(initial.document);
    const catalogueResponse = await page.request.get(`${environment.appUrl}/api/v1/coach/exercise-pilot`);
    expect(catalogueResponse.status()).toBe(200);
    const catalogue = exercisePilotListSchema.parse((await catalogueResponse.json()).data);
    expect(catalogue.items).toHaveLength(50);
    expect(catalogue.total).toBe(1186);
    expect(catalogue.pagination).toEqual({ offset: 0, limit: 50, hasMore: true });
    const deniedAmbiguous = await page.request.post(`${environment.appUrl}/api/v1/coach/exercise-pilot/select`, {
      headers: originHeaders, data: { sourceId: "DB_002", sourceVersion: "1.2.0", clientMutationId: randomUUID() },
    });
    expect(deniedAmbiguous.status()).toBe(400);
    let mobilityName = "";
    for (const sourceId of [...PILOT_IDS.filter(id => id !== "DB_034"), "MO_001"]) {
      const searchResponse = await page.request.get(`${environment.appUrl}/api/v1/coach/exercise-pilot?query=${sourceId}`);
      expect(searchResponse.status()).toBe(200);
      const matches = exercisePilotListSchema.parse((await searchResponse.json()).data);
      expect(matches.items).toHaveLength(1);
      const source = matches.items[0];
      expect(source.id).toBe(sourceId);
      expect(source.selection).toEqual({ canSelect: true, reason: null });
      const selection = await page.request.post(`${environment.appUrl}/api/v1/coach/exercise-pilot/select`, {
        headers: originHeaders, data: { sourceId: source.id, sourceVersion: source.sourceVersion, clientMutationId: randomUUID() },
      });
      expect(selection.status()).toBe(200);
      const exercise = exerciseSnapshotSchema.parse((await selection.json()).data.exercise);
      expect(exercise.canEdit).toBe(false);
      expect(exercise.pilot?.sourceId).toBe(source.id);
      if (sourceId === "MO_001") {
        mobilityName = source.name.fr;
        expect(exercise.pilot?.sourceCatalogVersion).toBe("4.0.0-unified.1");
        expect(exercise.defaultUnit).toBe("sec");
      } else expect(exercise.pilot?.sourceCatalogVersion).toBe("3.1.0-pilot.1");
      const movement = addLibraryExercise(exercise);
      movement.prescription.sets = 1;
      movement.prescription.reps = ["sec", "distance"].includes(exercise.defaultUnit) ? "1" : "8";
      movement.prescription.loadTarget = exercise.defaultUnit === "sec" ? "30" : exercise.defaultUnit === "distance" ? "20"
        : exercise.defaultUnit === "configuration" ? "Configuration test à identifier sans déduire une masse" : source.id === "BW_021" ? "0" : "12";
      document.weeks[0].sessions[0].blocks[0].exercises.push(movement);
    }
    const completeSave = await page.request.post(`${environment.appUrl}/api/v1/coach/programs`, {
      headers: originHeaders, data: { id: initial.id, expectedVersion: initial.version, clientMutationId: randomUUID(), document },
    });
    expect(completeSave.status()).toBe(200);
    const completed = programSnapshotSchema.parse((await completeSave.json()).data.program);
    expect(completed.version).toBe(2);
    expect(completed.document).toEqual(document);
    await page.reload();
    await page.getByRole("button", { name: "Ouvrir Semaine pilote E2E", exact: true }).click();
    await expect(page.getByRole("article", { name: /^Exercice \d+$/ })).toHaveCount(16);
    await page.getByRole("combobox", { name: "Client destinataire", exact: true }).selectOption({ label: "Client Pilote" });
    await expect(page.getByText("Ce client n’a pas encore de programme publié.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publier pour ce client", exact: true }).click();
    await page.getByRole("dialog", { name: "Publier ce programme", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.", { exact: true })).toBeVisible();

    const publicationRead = await clientContext.request.get(`${environment.appUrl}/api/v1/client/program`);
    expect(publicationRead.status()).toBe(200);
    const publication = publicationResponseSchema.parse((await publicationRead.json()).data).program;
    expect(publication).not.toBeNull();
    expect(publication!.document).toEqual(document);
    await clientPage.goto(`${environment.appUrl}/client/program`);
    await expect(clientPage.getByRole("heading", { name: "Semaine pilote E2E", exact: true })).toBeVisible();
    await expect(clientPage.getByRole("group", { name: "Semaines du programme", exact: true }).getByRole("button", { pressed: true })).toContainText("Semaine 1");
    await expect(clientPage.getByRole("group", { name: "Séances de la semaine 1", exact: true }).getByRole("button", { pressed: true })).toContainText("Séance pilote et mobilité");
    await clientPage.getByText("Voir le plan de la séance", { exact: true }).click();
    await expect(clientPage.getByRole("region", { name: "Consignes de l’exercice", exact: true })).toHaveCount(16);
    for (const exercise of document.weeks[0].sessions[0].blocks[0].exercises) {
      const card = clientPage.getByRole("heading", { name: exercise.pilot!.name.fr, exact: true }).locator("..");
      await card.getByText("Voir les trois étapes du mouvement", { exact: true }).click();
      await expect(card.locator("ol > li")).toHaveCount(3);
      for (const step of Object.values(exercise.pilot!.instructions.fr)) await expect(card.getByText(step, { exact: true })).toBeVisible();
      await expect(card.locator("img,video,iframe")).toHaveCount(0);
    }
    await clientPage.getByRole("button", { name: "English", exact: true }).click();
    await expect(clientPage.getByText(/Count repetitions for each arm separately/)).toBeVisible();
    await clientPage.getByRole("button", { name: "Français", exact: true }).click();
    await clientPage.getByRole("link", { name: "Ouvrir la séance", exact: true }).click();
    await clientPage.getByRole("button", { name: "Commencer la séance", exact: true }).click();
    await expect(clientPage.getByText("Séance commencée. Tu peux maintenant saisir tes résultats.", { exact: true })).toBeVisible();
    await clientPage.getByRole("button", { name: "Revoir/modifier mes résultats", exact: true }).click();

    const curl = firstSet(clientPage, "Curl alterné avec haltères");
    await curl.getByRole("combobox").selectOption("DONE");
    await curl.getByRole("spinbutton", { name: /^Répétitions par bras/ }).fill("8");
    await curl.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("12");
    const carry = firstSet(clientPage, "Marche du fermier avec haltères");
    await carry.getByRole("combobox").selectOption("DONE");
    await carry.getByRole("spinbutton", { name: /^Distance \(m\)/ }).fill("20");
    await carry.getByRole("textbox", { name: /^Charges transportées et unités/ }).fill("2 haltères de 20 lb");
    const plank = firstSet(clientPage, "Planche sur avant-bras");
    await plank.getByRole("combobox").selectOption("DONE");
    await plank.getByRole("spinbutton", { name: /^Durée \(sec\)/ }).fill("30");
    const band = firstSet(clientPage, "Pallof press debout avec bande");
    await band.getByRole("combobox").selectOption("DONE");
    await band.getByRole("spinbutton", { name: /^Répétitions par côté/ }).fill("8");
    await band.getByRole("textbox", { name: /^Configuration utilisée/ }).fill("Bande rouge, ancrage poitrine");
    await expect(band.getByRole("spinbutton", { name: /^Charge/ })).toHaveCount(0);
    const mobility = firstSet(clientPage, mobilityName);
    await mobility.getByRole("combobox").selectOption("DONE");
    await mobility.getByRole("spinbutton", { name: /^Durée \(sec\)/ }).fill("35");
    await clientPage.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
    await expect(clientPage.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();
    const workoutUrl = clientPage.url();
    const sessionId = document.weeks[0].sessions[0].id;
    const savedResponse = await clientContext.request.get(`${environment.appUrl}/api/v1/client/workouts/session?publicationId=${publication!.id}&weekNumber=1&sessionId=${sessionId}`);
    expect(savedResponse.status()).toBe(200);
    const saved = workoutSessionResponseSchema.parse((await savedResponse.json()).data);
    const selected = (sourceId: string) => saved.workout!.sets.find((set) => set.exerciseId === document.weeks[0].sessions[0].blocks[0].exercises.find((exercise) => exercise.pilot!.sourceId === sourceId)!.id)!;
    expect(selected("DB_034")).toMatchObject({ reps: 8, load: 12, unit: "lb" });
    expect(selected("DB_045")).toMatchObject({ reps: null, load: 20, unit: "distance", details: "2 haltères de 20 lb" });
    expect(selected("BW_049")).toMatchObject({ reps: null, load: 30, unit: "sec" });
    expect(selected("BA_027")).toMatchObject({ reps: 8, load: null, unit: "configuration", details: "Bande rouge, ancrage poitrine" });
    expect(selected("MO_001")).toMatchObject({ reps: null, load: 35, unit: "sec" });

    let newOtpRequests = 0;
    clientContext.on("request", (request) => { if (request.url().includes("/client-otp/request")) newOtpRequests++; });
    await clientPage.close();
    clientPage = await clientContext.newPage();
    await clientPage.goto(workoutUrl);
    await clientPage.getByRole("button", { name: "Revoir/modifier mes résultats", exact: true }).click();
    await expect(firstSet(clientPage, "Curl alterné avec haltères").getByRole("spinbutton", { name: /^Répétitions par bras/ })).toHaveValue("8");
    await expect(firstSet(clientPage, "Marche du fermier avec haltères").getByRole("textbox", { name: /^Charges transportées et unités/ })).toHaveValue("2 haltères de 20 lb");
    await expect(firstSet(clientPage, "Pallof press debout avec bande").getByRole("textbox", { name: /^Configuration utilisée/ })).toHaveValue("Bande rouge, ancrage poitrine");
    await expect(firstSet(clientPage, mobilityName).getByRole("spinbutton", { name: /^Durée \(sec\)/ })).toHaveValue("35");
    expect(newOtpRequests).toBe(0);
    await page.goto(`${environment.appUrl}/coach/clients/${clientId}/workouts`);
    await page.getByRole("button", { name: "Voir la prescription et les résultats", exact: true }).click();
    await expect(page.getByText(/2 haltères de 20 lb/)).toBeVisible();
    await expect(page.getByText(/Bande rouge, ancrage poitrine/)).toBeVisible();
  } finally {
    await clientContext.close();
  }
});
