import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_NUTRITION_DOCUMENT, clientNutritionResponseSchema, coachNutritionResponseSchema, type NutritionDocument } from "../../src/lib/contracts/client-followup";
import { programSnapshotSchema, type ProgramSnapshot } from "../../src/lib/contracts/training-drafts";
import { publicationResponseSchema, publicationSchema, type ProgramPublication } from "../../src/lib/contracts/training-publication";
import { workoutSessionResponseSchema, workoutSnapshotSchema, type SaveWorkoutRequest, type WorkoutSnapshot } from "../../src/lib/contracts/training-results";
import { exerciseSnapshotSchema } from "../../src/lib/contracts/training";
import { addLibraryExercise, newBlock, newProgram, newSession } from "../../src/lib/training/program-editor";
import { M1SsrSession, authenticatedFetch, createM1AdminClient, getM1TestEnvironment, seedStaffIdentity, type SeededStaff } from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const admin = createM1AdminClient(environment);
const password = "Withdrawal-local-fixture!123";
let coach: SeededStaff;
let coachSession: M1SsrSession;
let unverified: M1SsrSession;
let unassigned: M1SsrSession;
let foreignAdmin: M1SsrSession;
let client: { id: string; session: M1SsrSession };
let peer: { id: string; session: M1SsrSession };
let draft: ProgramSnapshot;
let firstTraining: ProgramPublication;
let secondTraining: ProgramPublication;
let thirdTraining: ProgramPublication;
let completed: WorkoutSnapshot;
let inProgress: WorkoutSnapshot;
let startedInput: SaveWorkoutRequest;
let firstNutritionId: string;
let secondNutritionId: string;
let thirdNutritionId: string;
let withdrawalTraining: { expectedPublicationId: string; clientMutationId: string };
let withdrawalNutrition: { action: "withdraw"; expectedPublicationId: string; clientMutationId: string };
const trainingPath = () => `/api/v1/coach/clients/${client.id}/program/withdraw`;
const nutritionPath = () => `/api/v1/coach/clients/${client.id}/nutrition`;
const nutrition: NutritionDocument = {
  ...structuredClone(EMPTY_NUTRITION_DOCUMENT), title: { fr: "Nutrition retrait QA", en: "Withdrawal nutrition QA" },
  meals: [{ id: randomUUID(), title: { fr: "Repas fictif", en: "Synthetic meal" }, portions: { fr: "Portion de test", en: "Test portion" }, notes: { fr: "", en: "" } }],
};

async function signIn(email: string) {
  const session = new M1SsrSession(environment);
  const signed = await session.client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error("Local withdrawal identity could not authenticate");
  return session;
}
async function verifyStaff(session: M1SsrSession, email: string) {
  expect((await authenticatedFetch(environment, session, "/api/v1/auth/coach-email-otp/request", { method: "POST" })).status).toBe(202);
  const mail = await waitForMail(environment.mailpitUrl, email, message => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  expect((await post(session, "/api/v1/auth/coach-email-otp/verify", { code: extractSixDigitOtp(mail) })).status).toBe(200);
}
function post(session: M1SsrSession, path: string, input: unknown) {
  return authenticatedFetch(environment, session, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}
async function body(response: Response, status = 200) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.status).toBe(status);
  return response.json();
}
async function denied(response: Response, status: number, code: string) {
  const result = await body(response, status);
  expect(result.error?.code).toBe(code);
  expect(result).not.toHaveProperty("data");
}
async function seedMember(role: "CLIENT" | "COACH") {
  const email = `withdrawal.${role.toLowerCase()}.${randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { m1_test_fixture: true } });
  if (created.error || !created.data.user) throw new Error("Local withdrawal identity could not be created");
  const userId = created.data.user.id;
  const results = await Promise.all([
    admin.from("profiles").insert({ auth_user_id: userId, display_name: "Withdrawal QA", status: "ACTIVE", created_by: coach.userId }),
    admin.from("organization_memberships").insert({ organization_id: coach.organizationId, user_id: userId, role, status: "ACTIVE", activated_at: new Date().toISOString(), created_by: coach.userId }),
  ]);
  if (results.some(result => result.error)) throw new Error("Local withdrawal membership could not be created");
  const id = role === "CLIENT" ? randomUUID() : userId;
  if (role === "CLIENT") {
    const inserted = await admin.from("clients").insert({ id, organization_id: coach.organizationId, auth_user_id: userId, email, first_name: "Synthetic", last_name: "Withdrawal", status: "ACTIVE", created_by: coach.userId });
    if (inserted.error) throw new Error("Local withdrawal Client could not be created");
  }
  return { id, session: await signIn(email), email };
}
async function saveNextProgram(title: string) {
  const document = structuredClone(draft.document);
  document.title.fr = title;
  draft = programSnapshotSchema.parse((await body(await post(coachSession, "/api/v1/coach/programs", {
    id: draft.id, expectedVersion: draft.version, clientMutationId: randomUUID(), document,
  }))).data.program);
}
function trainingPublishInput(expectedPublicationId: string | null) {
  return { clientId: client.id, programId: draft.id, draftVersion: draft.version, expectedPublicationId, clientMutationId: randomUUID() };
}
async function publishTraining(expectedPublicationId: string | null) {
  return publicationSchema.parse((await body(await post(coachSession, "/api/v1/coach/programs/publish", trainingPublishInput(expectedPublicationId)))).data.program);
}
async function saveNutrition(expectedVersion: number, title: string) {
  return coachNutritionResponseSchema.parse((await body(await post(coachSession, nutritionPath(), {
    action: "save", document: { ...nutrition, title: { fr: title, en: "" } }, expectedVersion, clientMutationId: randomUUID(),
  }))).data);
}
async function publishNutrition(expectedVersion: number, expectedPublicationId: string | null) {
  return coachNutritionResponseSchema.parse((await body(await post(coachSession, nutritionPath(), {
    action: "publish", expectedVersion, expectedPublicationId, clientMutationId: randomUUID(),
  }))).data);
}
async function readTraining(session = client.session) {
  return publicationResponseSchema.parse((await body(await authenticatedFetch(environment, session, "/api/v1/client/program"))).data).program;
}
async function readNutrition(session = client.session) {
  return clientNutritionResponseSchema.parse((await body(await authenticatedFetch(environment, session, "/api/v1/client/nutrition"))).data);
}
function resultInput(publication: ProgramPublication, status: "IN_PROGRESS" | "COMPLETED"): SaveWorkoutRequest {
  const session = publication.document.weeks[0].sessions[0];
  return {
    publicationId: publication.id, weekNumber: 1, sessionId: session.id, expectedVersion: 0, clientMutationId: randomUUID(), status,
    sets: [{ exerciseId: session.blocks[0].exercises[0].id, setNumber: 1, status: "DONE", reps: 8, load: 20, rir: 2 }],
    note: "Synthetic withdrawal result; preserve without modification",
  };
}
async function historicalWorkout(publication: ProgramPublication, actor = client.session, coachRead = false) {
  const query = new URLSearchParams({ publicationId: publication.id, weekNumber: "1", sessionId: publication.document.weeks[0].sessions[0].id });
  const path = coachRead ? `/api/v1/coach/clients/${client.id}/workouts/session` : "/api/v1/client/workouts/session";
  return workoutSessionResponseSchema.parse((await body(await authenticatedFetch(environment, actor, `${path}?${query}`))).data);
}

describe.sequential("Independent HTTP plan withdrawal security, history and concurrency", () => {
  beforeAll(async () => {
    coach = await seedStaffIdentity(environment, { email: `withdrawal.assigned.${randomUUID()}@example.test`, password, role: "COACH" });
    coachSession = await signIn(coach.email);
    unverified = await signIn(coach.email);
    const otherCoach = await seedMember("COACH");
    unassigned = otherCoach.session;
    const foreign = await seedStaffIdentity(environment, { email: `withdrawal.foreign.${randomUUID()}@example.test`, password, role: "ADMIN" });
    foreignAdmin = await signIn(foreign.email);
    client = await seedMember("CLIENT"); peer = await seedMember("CLIENT");
    const assignment = await admin.from("coach_client_assignments").insert({ organization_id: coach.organizationId, client_id: client.id, coach_user_id: coach.userId, status: "ACTIVE", created_by: coach.userId });
    if (assignment.error) throw new Error("Local withdrawal assignment could not be created");
    await verifyStaff(coachSession, coach.email);
    await verifyStaff(unassigned, otherCoach.email);
    await verifyStaff(foreignAdmin, foreign.email);
    const exercise = exerciseSnapshotSchema.parse((await body(await post(coachSession, "/api/v1/coach/exercises", {
      id: null, expectedVersion: 0, clientMutationId: randomUUID(), exercise: { name: "Withdrawal QA movement", equipment: "Test", cue: { fr: "", en: "" }, defaultUnit: "lb", archived: false },
    }))).data.exercise);
    const document = newProgram(); document.title.fr = "Training withdrawal A";
    const session = newSession(); session.title.fr = "Synthetic withdrawal session";
    const block = newBlock(); const movement = addLibraryExercise(exercise); movement.prescription.sets = 1;
    block.exercises.push(movement); session.blocks.push(block); document.weeks[0].sessions.push(session);
    document.weeks.push({ ...structuredClone(document.weeks[0]), number: 2 });
    draft = programSnapshotSchema.parse((await body(await post(coachSession, "/api/v1/coach/programs", { id: null, expectedVersion: 0, clientMutationId: randomUUID(), document }))).data.program);
    firstTraining = await publishTraining(null);
    completed = workoutSnapshotSchema.parse((await body(await post(client.session, "/api/v1/client/workouts", resultInput(firstTraining, "COMPLETED")))).data.workout);
    await saveNextProgram("Training withdrawal B"); secondTraining = await publishTraining(firstTraining.id);
    startedInput = resultInput(secondTraining, "IN_PROGRESS");
    inProgress = workoutSnapshotSchema.parse((await body(await post(client.session, "/api/v1/client/workouts", startedInput))).data.workout);
    await saveNutrition(0, "Nutrition withdrawal A"); firstNutritionId = (await publishNutrition(1, null)).publication!.id;
    await saveNutrition(1, "Nutrition withdrawal B"); secondNutritionId = (await publishNutrition(2, firstNutritionId)).publication!.id;
    withdrawalTraining = { expectedPublicationId: secondTraining.id, clientMutationId: randomUUID() };
    withdrawalNutrition = { action: "withdraw", expectedPublicationId: secondNutritionId, clientMutationId: randomUUID() };
  }, 120_000);

  it("denies anonymous, Client, unverified, unassigned and foreign actors without disclosing publications", async () => {
    for (const [path, input] of [[trainingPath(), withdrawalTraining], [nutritionPath(), withdrawalNutrition]] as const) {
      await denied(await fetch(new URL(path, environment.appUrl), { method: "POST", headers: { Origin: environment.appUrl, "content-type": "application/json" }, body: JSON.stringify(input), redirect: "manual" }), 401, "UNAUTHENTICATED");
      for (const actor of [client.session, peer.session]) await denied(await post(actor, path, input), 403, "FORBIDDEN");
      await denied(await post(unverified, path, input), 403, "FORBIDDEN");
      for (const actor of [unassigned, foreignAdmin]) await denied(await post(actor, path, input), 404, "NOT_FOUND");
    }
    expect((await readTraining())?.id).toBe(secondTraining.id);
    expect((await readNutrition()).publication?.id).toBe(secondNutritionId);
  }, 30_000);

  it("requires canonical Origin and rejects forged destination, null expected ID and extraneous fields", async () => {
    for (const [path, input] of [[trainingPath(), withdrawalTraining], [nutritionPath(), withdrawalNutrition]] as const) {
      for (const origin of [undefined, "https://attacker.example"]) {
        const headers: Record<string, string> = { cookie: coachSession.cookieHeader(), "content-type": "application/json" };
        if (origin) headers.origin = origin;
        await denied(await fetch(new URL(path, environment.appUrl), { method: "POST", headers, body: JSON.stringify(input), redirect: "manual" }), 403, "FORBIDDEN");
      }
      await denied(await post(coachSession, path, { ...input, clientId: peer.id }), 400, "VALIDATION_FAILED");
      await denied(await post(coachSession, path, { ...input, expectedPublicationId: null }), 400, "VALIDATION_FAILED");
      await denied(await post(coachSession, path, { ...input, reason: "not in the closed command contract" }), 400, "VALIDATION_FAILED");
    }
  }, 30_000);

  it("rejects stale withdrawal of A while B is active", async () => {
    await denied(await post(coachSession, trainingPath(), { expectedPublicationId: firstTraining.id, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    await denied(await post(coachSession, nutritionPath(), { action: "withdraw", expectedPublicationId: firstNutritionId, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    expect((await readTraining())?.id).toBe(secondTraining.id);
    expect((await readNutrition()).publication?.id).toBe(secondNutritionId);
  });

  it("withdraws B idempotently without resurrecting A or deleting immutable snapshots", async () => {
    const trainingResponses = await Promise.all([post(coachSession, trainingPath(), withdrawalTraining), post(coachSession, trainingPath(), withdrawalTraining)]);
    for (const response of trainingResponses) expect(publicationResponseSchema.parse((await body(response)).data).program).toBeNull();
    const nutritionResponses = await Promise.all([post(coachSession, nutritionPath(), withdrawalNutrition), post(coachSession, nutritionPath(), withdrawalNutrition)]);
    for (const response of nutritionResponses) {
      const state = coachNutritionResponseSchema.parse((await body(response)).data);
      expect(state.publication).toBeNull(); expect(state.history.map(item => item.id)).toEqual([secondNutritionId, firstNutritionId]);
    }
    expect(await readTraining()).toBeNull();
    const own = await readNutrition(); expect(own.publication).toBeNull();
    expect(own.history.find(item => item.id === secondNutritionId)?.withdrawnAt).toEqual(expect.any(String));
    expect(own.history.find(item => item.id === firstNutritionId)?.document.title.fr).toBe("Nutrition withdrawal A");
    const stored = await admin.from("training_program_publications").select("id,document").eq("organization_id", coach.organizationId).eq("client_id", client.id).order("revision");
    expect(stored.error).toBeNull(); expect(stored.data).toEqual([{ id: firstTraining.id, document: firstTraining.document }, { id: secondTraining.id, document: secondTraining.document }]);
    expect(await readTraining(peer.session)).toBeNull(); expect((await readNutrition(peer.session)).history).toHaveLength(0);
  }, 30_000);

  it("preserves completed and in-progress results but rejects every further mutation of the withdrawn publication", async () => {
    for (const [actor, coachRead] of [[client.session, false], [coachSession, true]] as const) {
      expect((await historicalWorkout(firstTraining, actor, coachRead)).workout).toEqual(completed);
      const withdrawn = await historicalWorkout(secondTraining, actor, coachRead);
      expect(withdrawn.workout).toEqual(inProgress);
      expect(withdrawn.publication.withdrawnAt).toEqual(expect.any(String));
    }
    for (const input of [startedInput, { ...startedInput, weekNumber: 2, clientMutationId: randomUUID() }, { ...startedInput, expectedVersion: inProgress.version, clientMutationId: randomUUID() }, { ...startedInput, status: "COMPLETED", expectedVersion: inProgress.version, clientMutationId: randomUUID() }]) {
      await denied(await post(client.session, "/api/v1/client/workouts", input), 409, "VERSION_CONFLICT");
    }
    expect((await historicalWorkout(secondTraining)).workout).toEqual(inProgress);
  }, 30_000);

  it("republishes a new revision after withdrawal and old retries never withdraw the new active plan", async () => {
    await saveNextProgram("Training withdrawal C"); thirdTraining = await publishTraining(null);
    expect(thirdTraining.revision).toBe(3);
    await saveNutrition(2, "Nutrition withdrawal C"); const next = await publishNutrition(3, null);
    thirdNutritionId = next.publication!.id; expect(next.publication?.revision).toBe(3);
    expect(publicationResponseSchema.parse((await body(await post(coachSession, trainingPath(), withdrawalTraining))).data).program?.id).toBe(thirdTraining.id);
    expect(coachNutritionResponseSchema.parse((await body(await post(coachSession, nutritionPath(), withdrawalNutrition))).data).publication?.id).toBe(thirdNutritionId);
    await denied(await post(coachSession, trainingPath(), { ...withdrawalTraining, expectedPublicationId: thirdTraining.id }), 409, "DUPLICATE");
    await denied(await post(coachSession, nutritionPath(), { ...withdrawalNutrition, expectedPublicationId: thirdNutritionId }), 409, "DUPLICATE");
    await denied(await post(coachSession, trainingPath(), { ...withdrawalTraining, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    await denied(await post(coachSession, nutritionPath(), { ...withdrawalNutrition, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    expect((await readTraining())?.id).toBe(thirdTraining.id); expect((await readNutrition()).publication?.id).toBe(thirdNutritionId);
  }, 30_000);

  it("serializes publication against withdrawal and permits only one distinct concurrent withdrawal", async () => {
    await saveNextProgram("Training withdrawal D");
    const publish = trainingPublishInput(thirdTraining.id);
    const responses = await Promise.all([
      post(coachSession, "/api/v1/coach/programs/publish", publish),
      post(coachSession, trainingPath(), { expectedPublicationId: thirdTraining.id, clientMutationId: randomUUID() }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex(response => response.status === 200);
    await body(responses[winner]); await denied(responses[1 - winner], 409, "VERSION_CONFLICT");
    let current = await readTraining();
    if (winner === 0) expect(current?.revision).toBe(4);
    else { expect(current).toBeNull(); current = await publishTraining(null); }
    expect(current?.id).not.toBe(firstTraining.id); expect(current?.revision).toBe(4);
    const distinct = await Promise.all([1, 2].map(() => post(coachSession, trainingPath(), { expectedPublicationId: current!.id, clientMutationId: randomUUID() })));
    expect(distinct.map(response => response.status).sort()).toEqual([200, 409]);
    for (const response of distinct) { if (response.status === 200) expect((await body(response)).data.program).toBeNull(); else await denied(response, 409, "VERSION_CONFLICT"); }
    expect(await readTraining()).toBeNull();
    await saveNutrition(3, "Nutrition withdrawal D");
    const nutritionRace = await Promise.all([
      post(coachSession, nutritionPath(), { action: "publish", expectedVersion: 4, expectedPublicationId: thirdNutritionId, clientMutationId: randomUUID() }),
      post(coachSession, nutritionPath(), { action: "withdraw", expectedPublicationId: thirdNutritionId, clientMutationId: randomUUID() }),
    ]);
    expect(nutritionRace.map(response => response.status).sort()).toEqual([200, 409]);
    const nutritionWinner = nutritionRace.findIndex(response => response.status === 200);
    await body(nutritionRace[nutritionWinner]); await denied(nutritionRace[1 - nutritionWinner], 409, "VERSION_CONFLICT");
    let activeNutrition = (await readNutrition()).publication;
    if (nutritionWinner === 0) expect(activeNutrition?.revision).toBe(4);
    else { expect(activeNutrition).toBeNull(); activeNutrition = (await publishNutrition(4, null)).publication; }
    expect(activeNutrition?.revision).toBe(4);
    const nutritionDistinct = await Promise.all([1, 2].map(() => post(coachSession, nutritionPath(), { action: "withdraw", expectedPublicationId: activeNutrition!.id, clientMutationId: randomUUID() })));
    expect(nutritionDistinct.map(response => response.status).sort()).toEqual([200, 409]);
    for (const response of nutritionDistinct) { if (response.status === 200) expect((await body(response)).data.publication).toBeNull(); else await denied(response, 409, "VERSION_CONFLICT"); }
    const history = await readNutrition(); expect(history.publication).toBeNull(); expect(history.history).toHaveLength(4);
  }, 30_000);

  it("checks current authorization before replaying a successful withdrawal receipt", async () => {
    const revoked = await admin.from("coach_client_assignments").update({ status: "COMPLETED" }).eq("organization_id", coach.organizationId).eq("client_id", client.id).eq("coach_user_id", coach.userId);
    if (revoked.error) throw new Error("Unable to revoke local withdrawal fixture assignment");
    await denied(await post(coachSession, trainingPath(), withdrawalTraining), 404, "NOT_FOUND");
    await denied(await post(coachSession, nutritionPath(), withdrawalNutrition), 404, "NOT_FOUND");
    expect(await readTraining()).toBeNull(); expect((await readNutrition()).history).toHaveLength(4);
    expect((await historicalWorkout(firstTraining)).workout).toEqual(completed);
  });
});
