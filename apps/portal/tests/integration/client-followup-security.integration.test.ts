import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EMPTY_NUTRITION_DOCUMENT, checkInsResponseSchema, clientNutritionResponseSchema,
  coachCheckInsResponseSchema, coachNutritionResponseSchema, emptyCheckInDocument,
  progressionResponseSchema, type NutritionDocument,
} from "../../src/lib/contracts/client-followup";
import { M1SsrSession, authenticatedFetch, createM1AdminClient, getM1TestEnvironment, seedStaffIdentity, type SeededStaff } from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const fixturePassword = "Followup-local-only!123";
const admin = createM1AdminClient(environment);
const checkInsPath = "/api/v1/client/check-ins";
let coach: SeededStaff;
let coachSession: M1SsrSession;
let unverified: M1SsrSession;
let unassigned: M1SsrSession;
let foreignAdmin: M1SsrSession;
let clientA: { id: string; userId: string; session: M1SsrSession };
let clientB: { id: string; userId: string; session: M1SsrSession };
const nutritionPath = () => `/api/v1/coach/clients/${clientA.id}/nutrition`;
const coachCheckInsPath = () => `/api/v1/coach/clients/${clientA.id}/check-ins`;
const nutrition: NutritionDocument = {
  ...structuredClone(EMPTY_NUTRITION_DOCUMENT), title: { fr: "Plan HTTP QA", en: "HTTP QA plan" },
  meals: [{ id: randomUUID(), title: { fr: "Repas HTTP", en: "HTTP meal" }, portions: { fr: "Une portion test", en: "One test portion" }, notes: { fr: "", en: "" } }],
};
const observation = {
  ...emptyCheckInDocument("2020-01-02"), measurements: { ...emptyCheckInDocument("2020-01-02").measurements, bodyWeightLb: 201.5 },
  sleepHours: 7.5, cardioMinutes: 0, notes: "PRIVATE_HTTP_FOLLOWUP_SENTINEL",
};

async function signIn(email: string) {
  const session = new M1SsrSession(environment);
  const result = await session.client.auth.signInWithPassword({ email, password: fixturePassword });
  if (result.error || !result.data.session) throw new Error("Unable to authenticate local follow-up fixture");
  return session;
}
async function verifyStaff(session: M1SsrSession, email: string) {
  const request = await authenticatedFetch(environment, session, "/api/v1/auth/coach-email-otp/request", { method: "POST" });
  expect(request.status).toBe(202);
  const mail = await waitForMail(environment.mailpitUrl, email, message => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  const verified = await authenticatedFetch(environment, session, "/api/v1/auth/coach-email-otp/verify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: extractSixDigitOtp(mail) }),
  });
  expect(verified.status).toBe(200);
}
async function seedSameOrganization(role: "COACH" | "CLIENT") {
  const email = `followup.${role.toLowerCase()}.${randomUUID()}@example.test`;
  const user = await admin.auth.admin.createUser({ email, password: fixturePassword, email_confirm: true, app_metadata: { m1_test_fixture: true } });
  if (user.error || !user.data.user) throw new Error("Unable to create local follow-up identity");
  const userId = user.data.user.id;
  for (const result of await Promise.all([
    admin.from("profiles").insert({ auth_user_id: userId, display_name: "Synthetic follow-up QA", status: "ACTIVE", created_by: coach.userId }),
    admin.from("organization_memberships").insert({ organization_id: coach.organizationId, user_id: userId, role, status: "ACTIVE", activated_at: new Date().toISOString(), created_by: coach.userId }),
  ])) if (result.error) throw new Error("Unable to create local follow-up membership");
  const session = await signIn(email);
  if (role === "COACH") return { id: userId, userId, session, email };
  const id = randomUUID();
  const inserted = await admin.from("clients").insert({ id, organization_id: coach.organizationId, auth_user_id: userId, email, first_name: "Synthetic", last_name: "Followup", status: "ACTIVE", created_by: coach.userId });
  if (inserted.error) throw new Error("Unable to create local follow-up Client");
  return { id, userId, session, email };
}
async function json(response: Response, status = 200) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.status).toBe(status);
  return response.json();
}
async function error(response: Response, status: number, code: string) {
  const body = await json(response, status);
  expect(body.error?.code).toBe(code);
  expect(typeof body.error?.message).toBe("string");
  expect(body).not.toHaveProperty("data");
}
function post(session: M1SsrSession, path: string, input: unknown) {
  return authenticatedFetch(environment, session, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

describe.sequential("Independent follow-up HTTP isolation and concurrency gate", () => {
  beforeAll(async () => {
    coach = await seedStaffIdentity(environment, { email: `followup.assigned.${randomUUID()}@example.test`, password: fixturePassword, role: "COACH" });
    coachSession = await signIn(coach.email);
    unverified = await signIn(coach.email);
    const otherCoach = await seedSameOrganization("COACH");
    unassigned = otherCoach.session;
    const foreign = await seedStaffIdentity(environment, { email: `followup.foreign.${randomUUID()}@example.test`, password: fixturePassword, role: "ADMIN" });
    foreignAdmin = await signIn(foreign.email);
    clientA = await seedSameOrganization("CLIENT");
    clientB = await seedSameOrganization("CLIENT");
    const assignment = await admin.from("coach_client_assignments").insert({ organization_id: coach.organizationId, client_id: clientA.id, coach_user_id: coach.userId, status: "ACTIVE", created_by: coach.userId });
    if (assignment.error) throw new Error("Unable to assign local follow-up Client");
    await verifyStaff(coachSession, coach.email);
    await verifyStaff(unassigned, otherCoach.email);
    await verifyStaff(foreignAdmin, foreign.email);
  }, 120_000);

  it("rejects anonymous reads and staff/Client role confusion at every new boundary", async () => {
    for (const path of ["/api/v1/client/nutrition", checkInsPath, "/api/v1/client/progression", nutritionPath(), coachCheckInsPath()]) {
      await error(await fetch(new URL(path, environment.appUrl), { redirect: "manual" }), 401, "UNAUTHENTICATED");
    }
    await error(await authenticatedFetch(environment, clientA.session, nutritionPath()), 403, "FORBIDDEN");
    await error(await authenticatedFetch(environment, coachSession, checkInsPath), 404, "NOT_FOUND");
    for (const path of [nutritionPath(), coachCheckInsPath()]) {
      await error(await authenticatedFetch(environment, unverified, path), 403, "FORBIDDEN");
      await error(await authenticatedFetch(environment, unassigned, path), 404, "NOT_FOUND");
      await error(await authenticatedFetch(environment, foreignAdmin, path), 404, "NOT_FOUND");
    }
  }, 30_000);

  it("rejects absent/foreign Origin, oversized bodies and injected destination identities", async () => {
    for (const [session, path, document] of [[clientA.session, checkInsPath, observation], [coachSession, nutritionPath(), nutrition]] as const) {
      for (const origin of [undefined, "https://attacker.example"]) {
        const headers: Record<string, string> = { cookie: session.cookieHeader(), "content-type": "application/json" };
        if (origin) headers.origin = origin;
        await error(await fetch(new URL(path, environment.appUrl), { method: "POST", headers, redirect: "manual", body: JSON.stringify({ action: "save", document, expectedVersion: 0, clientMutationId: randomUUID() }) }), 403, "FORBIDDEN");
      }
    }
    await error(await post(clientA.session, checkInsPath, { action: "save", document: observation, expectedVersion: 0, clientMutationId: randomUUID(), clientId: clientB.id }), 400, "VALIDATION_FAILED");
    await error(await post(clientA.session, checkInsPath, { action: "save", document: { ...observation, notes: "x".repeat(25_000) }, expectedVersion: 0, clientMutationId: randomUUID() }), 400, "VALIDATION_FAILED");
    await error(await post(unassigned, nutritionPath(), { action: "save", document: nutrition, expectedVersion: 0, clientMutationId: randomUUID() }), 404, "NOT_FOUND");
  }, 30_000);

  it("keeps Nutrition draft private, snapshots publications and makes retries idempotent", async () => {
    const save = { action: "save", document: nutrition, expectedVersion: 0, clientMutationId: randomUUID() };
    for (let i = 0; i < 2; i++) {
      const body = await json(await post(coachSession, nutritionPath(), save));
      expect(coachNutritionResponseSchema.parse(body.data).draft?.version).toBe(1);
    }
    const before = clientNutritionResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, "/api/v1/client/nutrition"))).data);
    expect(before).toEqual({ publication: null, history: [], historyTruncated: false });
    await error(await post(coachSession, nutritionPath(), { ...save, document: { ...nutrition, title: { fr: "Changed", en: "" } } }), 409, "DUPLICATE");
    const publish = { action: "publish", expectedVersion: 1, expectedPublicationId: null, clientMutationId: randomUUID() };
    const publications = await Promise.all([post(coachSession, nutritionPath(), publish), post(coachSession, nutritionPath(), publish)]);
    const first = coachNutritionResponseSchema.parse((await json(publications[0])).data);
    const retry = coachNutritionResponseSchema.parse((await json(publications[1])).data);
    expect(first.publication?.revision).toBe(1);
    expect(retry.publication?.id).toBe(first.publication?.id);
    expect(retry.history).toHaveLength(1);
    const revisionTwo = { ...nutrition, title: { fr: "Unpublished revision two", en: "" } };
    await json(await post(coachSession, nutritionPath(), { action: "save", document: revisionTwo, expectedVersion: 1, clientMutationId: randomUUID() }));
    const own = clientNutritionResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, "/api/v1/client/nutrition"))).data);
    expect(own.publication?.document).toEqual(nutrition);
    await error(await post(coachSession, nutritionPath(), { action: "publish", expectedVersion: 2, expectedPublicationId: null, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    const second = coachNutritionResponseSchema.parse((await json(await post(coachSession, nutritionPath(), { action: "publish", expectedVersion: 2, expectedPublicationId: first.publication!.id, clientMutationId: randomUUID() }))).data);
    expect(second.publication?.revision).toBe(2);
    expect(second.history.find(item => item.revision === 1)?.document).toEqual(nutrition);
    const peer = clientNutritionResponseSchema.parse((await json(await authenticatedFetch(environment, clientB.session, "/api/v1/client/nutrition"))).data);
    expect(peer.publication).toBeNull();
    expect(peer.history).toHaveLength(0);
  }, 30_000);

  it("allows incomplete Check-in drafts but never exposes them to Coach or progression", async () => {
    const input = { action: "save", document: { ...emptyCheckInDocument("2020-01-02"), notes: "Private partial draft" }, expectedVersion: 0, clientMutationId: randomUUID() };
    const saved = checkInsResponseSchema.parse((await json(await post(clientA.session, checkInsPath, input))).data);
    expect(saved.version).toBe(1);
    await error(await post(clientA.session, checkInsPath, { action: "submit", expectedVersion: 1, clientMutationId: randomUUID() }), 400, "VALIDATION_FAILED");
    const coachRead = await json(await authenticatedFetch(environment, coachSession, coachCheckInsPath()));
    expect(coachCheckInsResponseSchema.parse(coachRead.data).history).toHaveLength(0);
    expect(coachRead.data).not.toHaveProperty("draft");
    const own = progressionResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, "/api/v1/client/progression"))).data);
    expect(own.checkIns).toHaveLength(0);
    expect(own.checkInsTotal).toBe(0);
    expect(own.baseline).toBeNull();
    expect(own.completedWorkouts).toEqual({ total: 0, dates: [], datesTruncated: false });
    const other = checkInsResponseSchema.parse((await json(await authenticatedFetch(environment, clientB.session, checkInsPath))).data);
    expect(other.draft).toBeNull();
  }, 30_000);

  it("serializes concurrent saves with exactly one winner and no silent overwrite", async () => {
    const inputs = ["tab A", "tab B"].map(notes => ({ action: "save", document: { ...observation, notes }, expectedVersion: 1, clientMutationId: randomUUID() }));
    const responses = await Promise.all(inputs.map(input => post(clientA.session, checkInsPath, input)));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex(response => response.status === 200);
    const saved = checkInsResponseSchema.parse((await json(responses[winner])).data);
    expect(saved.version).toBe(2);
    expect(saved.draft?.document.notes).toBe(inputs[winner].document.notes);
    await error(responses[1 - winner], 409, "VERSION_CONFLICT");
    const retry = checkInsResponseSchema.parse((await json(await post(clientA.session, checkInsPath, inputs[winner]))).data);
    expect(retry.version).toBe(2);
    await error(await post(clientA.session, checkInsPath, { ...inputs[winner], document: { ...observation, notes: "Key collision" } }), 409, "DUPLICATE");
  }, 30_000);

  it("submits exactly once, maintains monotonic versions and shares only immutable observations", async () => {
    const submit = { action: "submit", expectedVersion: 2, clientMutationId: randomUUID() };
    const responses = await Promise.all([post(clientA.session, checkInsPath, submit), post(clientA.session, checkInsPath, submit)]);
    const results = await Promise.all(responses.map(async response => checkInsResponseSchema.parse((await json(response)).data)));
    for (const result of results) {
      expect(result.version).toBe(3);
      expect(result.draft).toBeNull();
      expect(result.history).toHaveLength(1);
    }
    expect(results[0].history[0].id).toBe(results[1].history[0].id);
    await error(await post(clientA.session, checkInsPath, { action: "save", document: observation, expectedVersion: 0, clientMutationId: randomUUID() }), 409, "VERSION_CONFLICT");
    const newDraft = checkInsResponseSchema.parse((await json(await post(clientA.session, checkInsPath, { action: "save", document: { ...observation, notes: "NEW_PRIVATE_DRAFT" }, expectedVersion: 3, clientMutationId: randomUUID() }))).data);
    expect(newDraft.version).toBe(4);
    const read = coachCheckInsResponseSchema.parse((await json(await authenticatedFetch(environment, coachSession, coachCheckInsPath()))).data);
    expect(read.total).toBe(1);
    expect(read.history[0].id).toBe(results[0].history[0].id);
    expect(read.history[0].document.notes).not.toBe("NEW_PRIVATE_DRAFT");
    const progression = progressionResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, "/api/v1/client/progression"))).data);
    expect(progression.checkIns).toHaveLength(1);
    expect(progression.checkIns[0].document.observedOn).toBe("2020-01-02");
    expect(progression.checkIns[0].document.cardioMinutes).toBe(0);
    expect(progression.checkIns[0].document.energy).toBeNull();
    const other = progressionResponseSchema.parse((await json(await authenticatedFetch(environment, clientB.session, "/api/v1/client/progression"))).data);
    expect(other.checkInsTotal).toBe(0);
  }, 30_000);

  it("rejects invalid history pages and loses read/replay authority after assignment revocation", async () => {
    for (const query of ["-1", "1.5", "NaN", "10001", "01"]) {
      await error(await authenticatedFetch(environment, clientA.session, `${checkInsPath}?page=${query}`), 400, "VALIDATION_FAILED");
      await error(await authenticatedFetch(environment, coachSession, `${coachCheckInsPath()}?page=${query}`), 400, "VALIDATION_FAILED");
    }
    const page = checkInsResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, `${checkInsPath}?page=1`))).data);
    expect(page.history).toHaveLength(0);
    expect(page.total).toBe(1);
    expect(page.historyTruncated).toBe(false);
    const revoked = await admin.from("coach_client_assignments").update({ status: "COMPLETED" }).eq("organization_id", coach.organizationId).eq("client_id", clientA.id).eq("coach_user_id", coach.userId);
    if (revoked.error) throw new Error("Unable to revoke the disposable local fixture assignment");
    for (const path of [nutritionPath(), coachCheckInsPath()]) await error(await authenticatedFetch(environment, coachSession, path), 404, "NOT_FOUND");
    await error(await post(coachSession, nutritionPath(), { action: "save", document: nutrition, expectedVersion: 2, clientMutationId: randomUUID() }), 404, "NOT_FOUND");
    expect(clientNutritionResponseSchema.parse((await json(await authenticatedFetch(environment, clientA.session, "/api/v1/client/nutrition"))).data).publication?.revision).toBe(2);
  }, 30_000);
});
