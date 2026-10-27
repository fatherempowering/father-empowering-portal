import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { EMPTY_NUTRITION_DOCUMENT, clientNutritionResponseSchema, coachNutritionResponseSchema } from "../../src/lib/contracts/client-followup";
import { programSnapshotSchema, type ProgramSnapshot } from "../../src/lib/contracts/training-drafts";
import { publicationResponseSchema, publicationSchema, type ProgramPublication } from "../../src/lib/contracts/training-publication";
import { workoutSnapshotSchema } from "../../src/lib/contracts/training-results";
import { exerciseSnapshotSchema } from "../../src/lib/contracts/training";
import { addLibraryExercise, newBlock, newProgram, newSession } from "../../src/lib/training/program-editor";
import { getM1TestEnvironment, seedStaffIdentity } from "../harness/m1-local-supabase";
import { extractActivation, extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const phases = [
  "01 Seed disposable Coach", "02 Coach login and email verification", "03 Client invitation delivery",
  "04 Client activation and identity", "05 Prepare Training and Nutrition history", "06 Training withdrawal confirmation",
  "07 Client Training history after withdrawal", "08 Withdrawn workout read-only", "09 Training explicit republication",
  "10 Nutrition withdrawal confirmation", "11 Select withdrawn Nutrition history", "12 Select previous Nutrition history",
  "13 Nutrition explicit republication and mobile", "14 Local Client and Coach logout",
] as const;
type Phase = typeof phases[number];
class SafeHttpFailure extends Error {
  constructor(readonly status: number) { super(`Unexpected HTTP status ${status}`); }
}
async function phase<T>(name: Phase, run: () => Promise<T>): Promise<T> {
  if (!phases.includes(name)) throw new Error("Unknown withdrawal E2E phase");
  return test.step(name, async () => {
    try { return await run(); }
    catch (error) {
      // Never forward Playwright's call log: it can contain entered credentials,
      // invitation URLs, email addresses or page content. Only closed labels
      // and an optional numeric HTTP status belong in the diagnostic artifact.
      throw new Error(`Withdrawal E2E failed at ${name}${error instanceof SafeHttpFailure ? `; HTTP ${error.status}` : ""}`);
    }
  });
}
async function code(page: Page, email: string) {
  const mail = await waitForMail(environment.mailpitUrl, email, message => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  try { await page.getByRole("textbox", { name: /chiffre 1 sur 6/i }).fill(extractSixDigitOtp(mail)); }
  catch { throw new Error("Unable to enter the disposable withdrawal verification code"); }
}
async function post(request: APIRequestContext, path: string, input: unknown) {
  const response = await request.post(`${environment.appUrl}${path}`, { headers: { Origin: environment.appUrl }, data: input, timeout: 30_000 });
  if (response.status() !== 200) throw new SafeHttpFailure(response.status());
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return (await response.json()).data;
}

test("Coach withdraws Training and Nutrition without losing Client history, then republishes explicitly", async ({ page, browser }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(30_000);
  const coach = await phase("01 Seed disposable Coach", () => seedStaffIdentity(environment, {
    email: `withdrawal.vertical.coach.${randomUUID()}@example.test`, password: "Withdrawal-vertical-local!123", role: "COACH",
  }));
  await phase("02 Coach login and email verification", async () => {
  await page.goto(`${environment.appUrl}/coach`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel(/courriel|email/i).fill(coach.email);
  try { await page.getByLabel(/^mot de passe$/i).fill(coach.password); }
  catch { throw new Error("Unable to enter the disposable withdrawal Coach password"); }
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
  await code(page, coach.email);
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  });

  const clientEmail = `withdrawal.vertical.client.${randomUUID()}@example.test`;
  const invitation = await phase("03 Client invitation delivery", async () => {
  await page.getByRole("button", { name: /ajouter un client/i }).click();
  await page.getByLabel(/prénom/i).fill("Client"); await page.getByLabel(/^nom$/i).fill("Retrait");
  await page.getByLabel(/courriel du client/i).fill(clientEmail);
  await page.getByRole("button", { name: /créer et inviter/i }).click();
  return waitForMail(environment.mailpitUrl, clientEmail, message => /\/activate#token=/.test(`${message.text}\n${message.html}`));
  });
  const context = await browser.newContext();
  let loggedOut = false;
  const logout = (request: APIRequestContext, role: "client" | "coach") => request.post(`${environment.appUrl}/api/v1/auth/${role}-logout`, {
    headers: { Origin: environment.appUrl }, timeout: 5_000,
  });
  try {
    const clientPage = await context.newPage();
    clientPage.setDefaultTimeout(30_000); clientPage.setDefaultNavigationTimeout(30_000);
    const clientId = await phase("04 Client activation and identity", async () => {
    try { await clientPage.goto(extractActivation(environment.appUrl, invitation).url); }
    catch { throw new Error("Unable to open the disposable withdrawal invitation"); }
    await clientPage.getByRole("button", { name: /envoyer mon code/i }).click();
    await code(clientPage, clientEmail);
    await clientPage.getByRole("button", { name: /activer mon portail/i }).click();
    await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
    const identity = await context.request.get(`${environment.appUrl}/api/v1/client/me`, { timeout: 30_000 });
    if (identity.status() !== 200) throw new SafeHttpFailure(identity.status());
    expect(identity.status()).toBe(200);
    return (await identity.json()).client.clientId as string;
    });
    const nutritionApi = `/api/v1/coach/clients/${clientId}/nutrition`;
    const withdrawApi = `/api/v1/coach/clients/${clientId}/program/withdraw`;

    // Existing authenticated HTTP commands prepare disposable history. No
    // privileged client is used to publish, withdraw or mutate workout results.
    const { first, second, completed, inProgress, session, nutritionA, nutritionB } = await phase("05 Prepare Training and Nutrition history", async () => {
    const exercise = exerciseSnapshotSchema.parse((await post(page.request, "/api/v1/coach/exercises", {
      id: null, expectedVersion: 0, clientMutationId: randomUUID(), exercise: { name: "Movement withdrawal E2E", equipment: "Synthetic", cue: { fr: "", en: "" }, defaultUnit: "lb", archived: false },
    })).exercise);
    const document = newProgram(); document.title.fr = "Programme conservé A";
    const session = newSession(); session.title.fr = "Séance conservée";
    const block = newBlock(); const movement = addLibraryExercise(exercise); movement.prescription.sets = 1;
    block.exercises.push(movement); session.blocks.push(block); document.weeks[0].sessions.push(session);
    let draft = programSnapshotSchema.parse((await post(page.request, "/api/v1/coach/programs", { id: null, expectedVersion: 0, clientMutationId: randomUUID(), document })).program);
    const publish = async (snapshot: ProgramSnapshot, previous: string | null) => publicationSchema.parse((await post(page.request, "/api/v1/coach/programs/publish", {
      clientId, programId: snapshot.id, draftVersion: snapshot.version, expectedPublicationId: previous, clientMutationId: randomUUID(),
    })).program);
    const saveResult = async (publication: ProgramPublication, status: "COMPLETED" | "IN_PROGRESS") => workoutSnapshotSchema.parse((await post(context.request, "/api/v1/client/workouts", {
      publicationId: publication.id, weekNumber: 1, sessionId: session.id, expectedVersion: 0, clientMutationId: randomUUID(), status,
      sets: [{ exerciseId: movement.id, setNumber: 1, status: "DONE", reps: 8, load: 20, rir: 2 }], note: "Résultat fictif à conserver après retrait.",
    })).workout);
    const first = await publish(draft, null); const completed = await saveResult(first, "COMPLETED");
    draft = programSnapshotSchema.parse((await post(page.request, "/api/v1/coach/programs", {
      id: draft.id, expectedVersion: draft.version, clientMutationId: randomUUID(), document: { ...draft.document, title: { fr: "Programme à retirer B", en: "" } },
    })).program);
    const second = await publish(draft, first.id); const inProgress = await saveResult(second, "IN_PROGRESS");
    const nutrition = { ...structuredClone(EMPTY_NUTRITION_DOCUMENT), title: { fr: "Nutrition conservée A", en: "" }, meals: [{ id: randomUUID(), title: { fr: "Repas fictif", en: "" }, portions: { fr: "Portion fictive", en: "" }, notes: { fr: "", en: "" } }] };
    await post(page.request, nutritionApi, { action: "save", expectedVersion: 0, clientMutationId: randomUUID(), document: nutrition });
    const nutritionA = coachNutritionResponseSchema.parse(await post(page.request, nutritionApi, { action: "publish", expectedVersion: 1, expectedPublicationId: null, clientMutationId: randomUUID() })).publication!;
    await post(page.request, nutritionApi, { action: "save", expectedVersion: 1, clientMutationId: randomUUID(), document: { ...nutrition, title: { fr: "Nutrition à retirer B", en: "" } } });
    const nutritionB = coachNutritionResponseSchema.parse(await post(page.request, nutritionApi, { action: "publish", expectedVersion: 2, expectedPublicationId: nutritionA.id, clientMutationId: randomUUID() })).publication!;
    return { first, second, completed, inProgress, session, nutritionA, nutritionB };
    });

    await phase("06 Training withdrawal confirmation", async () => {
    await clientPage.goto(`${environment.appUrl}/client/program?language=fr`);
    await expect(clientPage.getByRole("heading", { name: "Programme à retirer B", exact: true })).toBeVisible();
    await page.goto(`${environment.appUrl}/coach/clients/${clientId}/workouts`);
    let withdrawalRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === withdrawApi && request.method() === "POST") withdrawalRequests++; });
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Retirer ce programme?", exact: true });
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(withdrawalRequests).toBe(0);
    const before = await context.request.get(`${environment.appUrl}/api/v1/client/program`, { timeout: 30_000 });
    if (before.status() !== 200) throw new SafeHttpFailure(before.status());
    expect(publicationResponseSchema.parse((await before.json()).data).program?.id).toBe(second.id);
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Retirer ce programme?", exact: true });
    const withdrawal = page.waitForResponse(response => new URL(response.url()).pathname === withdrawApi && response.request().method() === "POST", { timeout: 30_000 });
    void withdrawal.catch(() => {});
    await dialog.getByRole("button", { name: "Confirmer le retrait", exact: true }).click();
    const withdrawn = await withdrawal; if (withdrawn.status() !== 200) throw new SafeHttpFailure(withdrawn.status()); expect(withdrawn.status()).toBe(200);
    expect(publicationResponseSchema.parse((await withdrawn.json()).data).program).toBeNull();
    expect(withdrawalRequests).toBe(1);
    await expect(page.getByText("Programme retiré. Les séances et résultats restent dans l’historique.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer le plan actif", exact: true })).toHaveCount(0);
    });
    await phase("07 Client Training history after withdrawal", async () => {
    await clientPage.reload();
    await expect(clientPage.getByText("Aucun programme actif pour le moment. Ton coach prépare la suite; tes séances et résultats restent dans l’historique.", { exact: true })).toBeVisible();
    await expect(clientPage.getByRole("heading", { name: "Historique des séances", exact: true })).toBeVisible();
    const historical = await context.request.get(`${environment.appUrl}/api/v1/client/workouts`, { timeout: 30_000 });
    if (historical.status() !== 200) throw new SafeHttpFailure(historical.status());
    expect(historical.status()).toBe(200);
    expect((await historical.json()).data.items.map((item: { id: string }) => item.id).sort()).toEqual([completed.id, inProgress.id].sort());
    });

    await phase("08 Withdrawn workout read-only", async () => {
    await clientPage.goto(`${environment.appUrl}/client/workout?${new URLSearchParams({ publicationId: second.id, weekNumber: "1", sessionId: session.id })}`);
    await expect(clientPage.getByText("PLAN RETIRÉ", { exact: true })).toBeVisible();
    await clientPage.getByRole("button", { name: "Consulter mes résultats", exact: true }).click();
    await expect(clientPage.getByText("Plan retiré. Résultats conservés en lecture seule.", { exact: true })).toBeVisible();
    await expect(clientPage.getByLabel("Charge (lb) · Movement withdrawal E2E · série 1", { exact: true })).toHaveValue("20");
    await expect(clientPage.getByLabel("Charge (lb) · Movement withdrawal E2E · série 1", { exact: true })).toBeDisabled();
    await expect(clientPage.getByRole("button", { name: "Terminer la séance", exact: true })).toHaveCount(0);
    await expect(clientPage.getByRole("button", { name: "Ajouter une série extra", exact: true })).toHaveCount(0);
    });

    await phase("09 Training explicit republication", async () => {
    await page.goto(`${environment.appUrl}/coach/programs`);
    await page.getByRole("button", { name: "Ouvrir Programme à retirer B", exact: true }).click();
    await page.getByLabel("Titre du programme · français", { exact: true }).fill("Programme republié C");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(page.getByText("Brouillon enregistré · version 3.", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Client destinataire", exact: true }).selectOption({ label: "Client Retrait" });
    await expect(page.getByText("Ce client n’a pas encore de programme publié.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publier pour ce client", exact: true }).click();
    await page.getByRole("dialog", { name: "Publier ce programme", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.", { exact: true })).toBeVisible();
    await clientPage.goto(`${environment.appUrl}/client/program?language=fr`);
    await expect(clientPage.getByRole("heading", { name: "Programme republié C", exact: true })).toBeVisible();
    const thirdRead = await context.request.get(`${environment.appUrl}/api/v1/client/program`, { timeout: 30_000 });
    if (thirdRead.status() !== 200) throw new SafeHttpFailure(thirdRead.status());
    const third = publicationResponseSchema.parse((await thirdRead.json()).data).program;
    expect(third?.revision).toBe(3); expect(third?.id).not.toBe(first.id); expect(third?.id).not.toBe(second.id);
    });

    await phase("10 Nutrition withdrawal confirmation", async () => {
    await clientPage.goto(`${environment.appUrl}/client/nutrition?language=fr`);
    await expect(clientPage.getByRole("heading", { name: "Nutrition à retirer B", exact: true })).toBeVisible();
    await page.goto(`${environment.appUrl}/coach/clients/${clientId}/followup`);
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    await page.getByRole("dialog", { name: "Retirer ce plan nutritionnel?", exact: true }).getByRole("button", { name: "Annuler", exact: true }).click();
    const cancelledNutrition = await context.request.get(`${environment.appUrl}/api/v1/client/nutrition`, { timeout: 30_000 });
    if (cancelledNutrition.status() !== 200) throw new SafeHttpFailure(cancelledNutrition.status());
    expect(clientNutritionResponseSchema.parse((await cancelledNutrition.json()).data).publication?.id).toBe(nutritionB.id);
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    const nutritionWithdrawal = page.waitForResponse(response => new URL(response.url()).pathname === nutritionApi && response.request().method() === "POST", { timeout: 30_000 });
    void nutritionWithdrawal.catch(() => {});
    await page.getByRole("dialog", { name: "Retirer ce plan nutritionnel?", exact: true }).getByRole("button", { name: "Confirmer le retrait", exact: true }).click();
    const nutritionResponse = await nutritionWithdrawal; if (nutritionResponse.status() !== 200) throw new SafeHttpFailure(nutritionResponse.status()); expect(nutritionResponse.status()).toBe(200);
    expect(coachNutritionResponseSchema.parse((await nutritionResponse.json()).data).publication).toBeNull();
    await expect(page.getByText("Plan nutritionnel retiré. Les versions précédentes restent consultables.", { exact: true })).toBeVisible();
    });
    await phase("11 Select withdrawn Nutrition history", async () => {
    await clientPage.reload();
    await expect(clientPage.getByRole("heading", { name: "Ton plan est en préparation.", exact: true })).toBeVisible();
    await clientPage.getByRole("combobox", { name: "Version du plan", exact: true }).selectOption(nutritionB.id);
    await expect(clientPage.getByText("Plan retiré · consultation uniquement.", { exact: true })).toBeVisible();
    await expect(clientPage.getByRole("heading", { name: "Nutrition à retirer B", exact: true })).toBeVisible();
    });
    await phase("12 Select previous Nutrition history", async () => {
    await clientPage.getByRole("combobox", { name: "Version du plan", exact: true }).selectOption(nutritionA.id);
    await expect(clientPage.getByRole("heading", { name: "Nutrition conservée A", exact: true })).toBeVisible();
    await expect(clientPage.getByText("Version précédente · consultation uniquement.", { exact: true })).toBeVisible();
    });

    // Explicit Coach republication is necessary; an older archived plan must
    // never silently become current when the most recent plan is withdrawn.
    await phase("13 Nutrition explicit republication and mobile", async () => {
    await page.getByRole("group", { name: /^Titre du plan/ }).getByRole("textbox", { name: "Français", exact: true }).fill("Nutrition republiée C");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(page.getByText("Brouillon enregistré. Il reste privé jusqu’à la publication.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publier le plan nutritionnel", exact: true }).click();
    await page.getByRole("dialog", { name: "Publier ce plan?", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    await expect(page.getByText("Plan nutritionnel publié. Le client peut maintenant le consulter.", { exact: true })).toBeVisible();
    await clientPage.reload();
    await expect(clientPage.getByRole("heading", { name: "Nutrition republiée C", exact: true })).toBeVisible();
    const republished = await context.request.get(`${environment.appUrl}/api/v1/client/nutrition`, { timeout: 30_000 });
    if (republished.status() !== 200) throw new SafeHttpFailure(republished.status());
    expect(clientNutritionResponseSchema.parse((await republished.json()).data).publication?.revision).toBe(3);
    await clientPage.setViewportSize({ width: 390, height: 844 });
    expect(await clientPage.evaluate(() => window.document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
    await phase("14 Local Client and Coach logout", async () => {
      const responses = await Promise.all([logout(context.request, "client"), logout(page.request, "coach")]);
      for (const response of responses) { if (response.status() !== 200) throw new SafeHttpFailure(response.status()); expect(response.status()).toBe(200); }
      loggedOut = true;
    });
  } finally {
    try {
      if (!loggedOut) await Promise.allSettled([logout(context.request, "client"), logout(page.request, "coach")]);
    } catch {
      test.info().annotations.push({ type: "cleanup", description: "Disposable session cleanup could not finish; primary test failure preserved." });
    }
    // Cleanup must neither replace the first failure nor consume the remaining
    // test timeout. The fixture also owns final disposal of browser contexts.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
      Promise.resolve().then(() => context.close()).then(() => true, () => false),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 5_000); }),
    ]);
    clearTimeout(timer);
    if (!closed) test.info().annotations.push({ type: "cleanup", description: "Disposable Client context cleanup did not complete; primary test failure preserved." });
  }
});
