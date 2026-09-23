import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EMPTY_INITIAL_ASSESSMENT_RESPONSES,
} from "@/lib/contracts/week-zero";
import {
  EMPTY_ONBOARDING_RESPONSES,
  onboardingResponsesSchema,
  type OnboardingResponses,
} from "@/lib/contracts/onboarding";
import {
  ONBOARDING_QUESTIONS,
  ONBOARDING_SECTIONS,
  type OnboardingQuestion,
} from "@/lib/contracts/onboarding-definition";
import {
  M1SsrSession,
  authenticatedFetch,
  createM1AdminClient,
  getM1TestEnvironment,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

export const PRIVATE_HEALTH_SENTINEL = "ONBOARDING_PRIVATE_HEALTH_DO_NOT_LOG";
export const PRIVATE_NUTRITION_SENTINEL = "ONBOARDING_PRIVATE_NUTRITION_DO_NOT_LOG";

const environment = getM1TestEnvironment();
const fixturePassword = "M1-local-only-Onboarding!123";

type Intake = Readonly<{
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
  version: number;
  responses: OnboardingResponses;
  [key: string]: unknown;
}>;

type SeededClient = Readonly<{
  clientId: string;
  email: string;
  userId: string;
  displayName: string;
}>;

type TallyQuestion = Readonly<{
  sourceId: string;
  title: string;
  type: string;
  required: boolean;
  options: readonly string[];
}>;

type TallySource = Readonly<{
  sections: readonly Readonly<{
    title: string;
    questions: readonly TallyQuestion[];
  }>[];
}>;

let assignedCoach: SeededStaff;
let unassignedCoach: SeededStaff;
let organizationAdmin: SeededStaff;
let crossOrganizationAdmin: SeededStaff;
let assignedCoachSession: M1SsrSession;
let unverifiedAssignedCoachSession: M1SsrSession;
let unassignedCoachSession: M1SsrSession;
let organizationAdminSession: M1SsrSession;
let crossOrganizationAdminSession: M1SsrSession;
let clientA: SeededClient;
let clientB: SeededClient;
let clientASession: M1SsrSession;
let clientASecondSession: M1SsrSession;
let clientBSession: M1SsrSession;
let initialIntake: Intake;
let draftIntake: Intake;
let submittedIntake: Intake;
let completeResponses: OnboardingResponses;

function expectPrivateResponse(response: Response): void {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

async function responseIntake(response: Response): Promise<Intake> {
  const body = (await response.json()) as { data?: { intake?: Intake } };
  expect(body.data?.intake).toBeTruthy();
  return body.data!.intake!;
}

async function expectErrorCode(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  expectPrivateResponse(response);
  expect(response.status).toBe(status);
  const body = (await response.json()) as {
    error?: { code?: unknown; message?: unknown };
  };
  expect(body.error?.code).toBe(code);
  expect(typeof body.error?.message).toBe("string");
}

function answerForQuestion(question: OnboardingQuestion): string | number | string[] {
  if (question.key === "fullName") return "Réponse questionnaire seulement";
  if (question.key === "email") return "answer-only@example.test";
  if (question.key === "phoneNumber") return "+1 514 555 0199";
  if (question.key === "healthNotes") return PRIVATE_HEALTH_SENTINEL;
  if (question.key === "nutritionPriority") return PRIVATE_NUTRITION_SENTINEL;
  if (question.type === "multi") return [question.options![0]!.value];
  if (question.type === "single") return question.options![0]!.value;
  if (question.type === "scale") return question.min ?? 0;
  if (question.type === "number") {
    const values: Partial<Record<OnboardingQuestion["key"], number>> = {
      trainingYears: 5.5,
      currentTrainingDays: 3,
      realisticTrainingDays: 4,
      sleepHours: 7.5,
      mealsPerDay: 3,
    };
    return values[question.key] ?? question.min ?? 1;
  }
  return `Réponse synthétique ${question.key}`;
}

function completedFrom(base: OnboardingResponses): OnboardingResponses {
  const responses = structuredClone(base);
  for (const question of ONBOARDING_QUESTIONS) {
    responses[question.key] = answerForQuestion(question);
  }
  return onboardingResponsesSchema.parse(responses);
}

function partialFrom(base: OnboardingResponses): OnboardingResponses {
  return onboardingResponsesSchema.parse({
    ...structuredClone(base),
    whyNow: "Je commence maintenant pour une raison synthétique.",
    healthNotes: PRIVATE_HEALTH_SENTINEL,
    nutritionPriority: PRIVATE_NUTRITION_SENTINEL,
  });
}

async function seedStaffInOrganization(input: {
  organizationId: string;
  createdBy: string;
  email: string;
  role: "ADMIN" | "COACH";
}): Promise<SeededStaff> {
  const admin = createM1AdminClient(environment);
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: fixturePassword,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error("Unable to seed the onboarding staff fixture");
  }

  const userId = created.data.user.id;
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: userId,
      display_name: input.role === "ADMIN" ? "Admin onboarding" : "Coach onboarding non assigné",
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: input.createdBy,
    }),
    admin.from("organization_memberships").insert({
      organization_id: input.organizationId,
      user_id: userId,
      role: input.role,
      status: "ACTIVE",
      activated_at: new Date().toISOString(),
      created_by: input.createdBy,
    }),
  ]);
  for (const write of writes) {
    if (write.error) throw write.error;
  }
  return { userId, organizationId: input.organizationId, email: input.email, password: fixturePassword, role: input.role };
}

async function seedClient(input: {
  organizationId: string;
  createdBy: string;
  assignedCoachUserId?: string;
  name: string;
}): Promise<SeededClient> {
  const admin = createM1AdminClient(environment);
  const email = `onboarding.${input.name.toLowerCase()}.${randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: fixturePassword,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error("Unable to seed the onboarding Client fixture");
  }

  const userId = created.data.user.id;
  const clientId = randomUUID();
  const displayName = `Client ${input.name}`;
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: userId,
      display_name: displayName,
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: input.createdBy,
    }),
    admin.from("organization_memberships").insert({
      organization_id: input.organizationId,
      user_id: userId,
      role: "CLIENT",
      status: "ACTIVE",
      activated_at: new Date().toISOString(),
      created_by: input.createdBy,
    }),
    admin.from("clients").insert({
      id: clientId,
      organization_id: input.organizationId,
      auth_user_id: userId,
      email,
      first_name: "Client",
      last_name: input.name,
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: input.createdBy,
    }),
  ]);
  for (const write of writes) {
    if (write.error) throw write.error;
  }

  if (input.assignedCoachUserId) {
    const assignment = await admin.from("coach_client_assignments").insert({
      organization_id: input.organizationId,
      coach_user_id: input.assignedCoachUserId,
      client_id: clientId,
      is_primary: true,
      status: "ACTIVE",
      created_by: input.createdBy,
    });
    if (assignment.error) throw assignment.error;
  }
  return { clientId, email, userId, displayName };
}

async function signIn(email: string): Promise<M1SsrSession> {
  const session = new M1SsrSession(environment);
  const result = await session.client.auth.signInWithPassword({ email, password: fixturePassword });
  if (result.error) throw result.error;
  return session;
}

async function verifyCoachEmail(session: M1SsrSession, coach: SeededStaff): Promise<void> {
  const request = await authenticatedFetch(
    environment,
    session,
    "/api/v1/auth/coach-email-otp/request",
    { method: "POST" },
  );
  expect(request.status).toBe(202);
  const mail = await waitForMail(environment.mailpitUrl, coach.email, (message) => {
    try {
      extractSixDigitOtp(message);
      return true;
    } catch {
      return false;
    }
  });
  const verification = await authenticatedFetch(
    environment,
    session,
    "/api/v1/auth/coach-email-otp/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: extractSixDigitOtp(mail) }),
    },
  );
  expect(verification.status).toBe(200);
}

function coachPath(clientId: string): string {
  return `/api/v1/coach/clients/${encodeURIComponent(clientId)}/onboarding`;
}

describe.sequential("Client onboarding persistence, privacy and isolation gate", () => {
  beforeAll(async () => {
    assignedCoach = await seedStaffIdentity(environment, {
      email: `onboarding.assigned.${randomUUID()}@example.test`,
      password: fixturePassword,
      role: "COACH",
    });
    unassignedCoach = await seedStaffInOrganization({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      email: `onboarding.unassigned.${randomUUID()}@example.test`,
      role: "COACH",
    });
    organizationAdmin = await seedStaffInOrganization({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      email: `onboarding.admin.${randomUUID()}@example.test`,
      role: "ADMIN",
    });
    crossOrganizationAdmin = await seedStaffIdentity(environment, {
      email: `onboarding.cross-org.${randomUUID()}@example.test`,
      password: fixturePassword,
      role: "ADMIN",
    });
    clientA = await seedClient({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      assignedCoachUserId: assignedCoach.userId,
      name: "Alpha",
    });
    clientB = await seedClient({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      name: "Bravo",
    });

    assignedCoachSession = await signIn(assignedCoach.email);
    unverifiedAssignedCoachSession = await signIn(assignedCoach.email);
    unassignedCoachSession = await signIn(unassignedCoach.email);
    organizationAdminSession = await signIn(organizationAdmin.email);
    crossOrganizationAdminSession = await signIn(crossOrganizationAdmin.email);
    clientASession = await signIn(clientA.email);
    clientASecondSession = await signIn(clientA.email);
    clientBSession = await signIn(clientB.email);

    await verifyCoachEmail(assignedCoachSession, assignedCoach);
    await verifyCoachEmail(unassignedCoachSession, unassignedCoach);
    await verifyCoachEmail(organizationAdminSession, organizationAdmin);
    await verifyCoachEmail(crossOrganizationAdminSession, crossOrganizationAdmin);
  });

  it("conserve exactement les 64 questions et les types/requis de la source Tally", () => {
    const source = JSON.parse(
      readFileSync(new URL("../../docs/client/tally-onboarding-source.json", import.meta.url), "utf8"),
    ) as TallySource;
    const sourceQuestions = source.sections.flatMap((section) => section.questions);
    const typeMap: Record<string, OnboardingQuestion["type"]> = {
      INPUT_TEXT: "text",
      INPUT_EMAIL: "email",
      INPUT_PHONE_NUMBER: "tel",
      INPUT_NUMBER: "number",
      TEXTAREA: "textarea",
      LINEAR_SCALE: "scale",
      MULTIPLE_CHOICE_OPTION: "single",
      CHECKBOX: "multi",
    };

    expect(source.sections).toHaveLength(6);
    expect(ONBOARDING_SECTIONS).toHaveLength(6);
    expect(sourceQuestions).toHaveLength(64);
    expect(ONBOARDING_QUESTIONS).toHaveLength(64);
    expect(new Set(sourceQuestions.map((question) => question.sourceId)).size).toBe(64);
    expect(new Set(ONBOARDING_QUESTIONS.map((question) => question.key)).size).toBe(64);
    expect(new Set(ONBOARDING_QUESTIONS.map((question) => question.sourceId)).size).toBe(64);

    for (const sourceQuestion of sourceQuestions) {
      const native = ONBOARDING_QUESTIONS.find(
        (question) => question.sourceId === sourceQuestion.sourceId,
      );
      expect(native, sourceQuestion.title).toBeTruthy();
      expect(native?.type).toBe(typeMap[sourceQuestion.type]);
      expect(native?.required).toBe(sourceQuestion.required);
      if (["single", "multi"].includes(native!.type)) {
        expect(native?.options).toHaveLength(sourceQuestion.options.length);
      }
    }
    expect(ONBOARDING_QUESTIONS.filter((question) => question.required)).toHaveLength(54);
  });

  it("refuse les lectures et mutations sans session ou avec le mauvais rôle", async () => {
    const anonymousClient = await fetch(`${environment.appUrl}/api/v1/client/onboarding`);
    await expectErrorCode(anonymousClient, 401, "UNAUTHENTICATED");
    const anonymousCoach = await fetch(new URL(coachPath(clientA.clientId), environment.appUrl));
    await expectErrorCode(anonymousCoach, 401, "UNAUTHENTICATED");

    for (const [path, method, body] of [
      ["/api/v1/client/onboarding", "PUT", { expectedVersion: 0, clientMutationId: randomUUID(), responses: EMPTY_ONBOARDING_RESPONSES }],
      ["/api/v1/client/onboarding/submit", "POST", { expectedVersion: 1, clientMutationId: randomUUID() }],
    ] as const) {
      const response = await fetch(new URL(path, environment.appUrl), {
        method,
        headers: { origin: environment.appUrl, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await expectErrorCode(response, 401, "UNAUTHENTICATED");
    }

    const coachAtClientBoundary = await authenticatedFetch(
      environment,
      assignedCoachSession,
      "/api/v1/client/onboarding",
    );
    await expectErrorCode(coachAtClientBoundary, 403, "FORBIDDEN");
    const clientAtCoachBoundary = await authenticatedFetch(
      environment,
      clientASession,
      coachPath(clientA.clientId),
    );
    await expectErrorCode(clientAtCoachBoundary, 403, "FORBIDDEN");
  });

  it("préremplit sans écrire et refuse origin, taille, clés, types et valeurs invalides", async () => {
    const initial = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding",
    );
    expectPrivateResponse(initial);
    expect(initial.status).toBe(200);
    initialIntake = await responseIntake(initial);
    expect(initialIntake).toMatchObject({ status: "NOT_STARTED", version: 0 });
    expect(initialIntake.responses.fullName).toBe(clientA.displayName);
    expect(initialIntake.responses.email).toBe(clientA.email);
    expect(Object.keys(initialIntake.responses)).toHaveLength(64);
    const prefillingDidNotWrite = await createM1AdminClient(environment)
      .from("client_onboarding_intakes")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientA.clientId);
    expect(prefillingDidNotWrite.error).toBeNull();
    expect(prefillingDidNotWrite.count).toBe(0);
    completeResponses = completedFrom(initialIntake.responses);

    for (const [path, method, body] of [
      ["/api/v1/client/onboarding", "PUT", { expectedVersion: 0, clientMutationId: randomUUID(), responses: initialIntake.responses }],
      ["/api/v1/client/onboarding/submit", "POST", { expectedVersion: 1, clientMutationId: randomUUID() }],
    ] as const) {
      const crossOrigin = await fetch(new URL(path, environment.appUrl), {
        method,
        headers: {
          cookie: clientASession.cookieHeader(),
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      await expectErrorCode(crossOrigin, 403, "FORBIDDEN");
    }

    const missingKey = { ...initialIntake.responses } as Record<string, unknown>;
    delete missingKey.fullName;
    const invalidBodies: Record<string, unknown>[] = [
      { ...initialIntake.responses, unexpected: "not allowed" },
      missingKey,
      { ...initialIntake.responses, email: "not-an-email" },
      { ...initialIntake.responses, commitmentScore: 11 },
      { ...initialIntake.responses, trainingLocations: ["HOME_GYM", "HOME_GYM"] },
      { ...initialIntake.responses, preferredTrainingTime: "MIDNIGHT" },
    ];
    for (const responses of invalidBodies) {
      const invalid = await authenticatedFetch(
        environment,
        clientASession,
        "/api/v1/client/onboarding",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: 0, clientMutationId: randomUUID(), responses }),
        },
      );
      await expectErrorCode(invalid, 400, "VALIDATION_FAILED");
    }

    const oversized = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: randomUUID(),
          responses: { ...initialIntake.responses, whyNow: "x".repeat(263_000) },
        }),
      },
    );
    await expectErrorCode(oversized, 400, "VALIDATION_FAILED");

    const unchanged = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding");
    expect(await responseIntake(unchanged)).toMatchObject({ status: "NOT_STARTED", version: 0 });
  });

  it("sauvegarde et reprend un brouillon privé sans altérer le bilan initial", async () => {
    const partialResponses = partialFrom(initialIntake.responses);
    const commandId = randomUUID();
    const payload = { expectedVersion: 0, clientMutationId: commandId, responses: partialResponses };
    const save = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expectPrivateResponse(save);
    expect(save.status).toBe(200);
    const savedBody = await save.clone().json();
    draftIntake = await responseIntake(save);
    expect(draftIntake).toMatchObject({ status: "DRAFT", version: 1, responses: partialResponses });

    const retry = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(savedBody);

    const resume = await authenticatedFetch(environment, clientASecondSession, "/api/v1/client/onboarding");
    expect(await responseIntake(resume)).toEqual(draftIntake);

    for (const session of [assignedCoachSession, organizationAdminSession]) {
      const staffRead = await authenticatedFetch(environment, session, coachPath(clientA.clientId));
      expectPrivateResponse(staffRead);
      expect(staffRead.status).toBe(200);
      const serialized = JSON.stringify(await staffRead.json());
      expect(serialized).toContain('"status":"NOT_SUBMITTED"');
      expect(serialized).not.toContain(PRIVATE_HEALTH_SENTINEL);
      expect(serialized).not.toContain(PRIVATE_NUTRITION_SENTINEL);
    }

    const assessmentBefore = await authenticatedFetch(environment, clientASession, "/api/v1/client/week-zero");
    expect(await assessmentBefore.json()).toMatchObject({ data: { assessment: { status: "NOT_STARTED", version: 0 } } });
    const assessmentSave = await authenticatedFetch(environment, clientASession, "/api/v1/client/week-zero", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 0,
        clientMutationId: randomUUID(),
        responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
      }),
    });
    expect(assessmentSave.status).toBe(200);
    expect(await responseIntake(
      await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding"),
    )).toEqual(draftIntake);
  });

  it("rejette l'incomplet, le stale write et une clé réutilisée pour un autre contenu", async () => {
    const incomplete = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: draftIntake.version, clientMutationId: randomUUID() }),
      },
    );
    await expectErrorCode(incomplete, 400, "VALIDATION_FAILED");

    const stale = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 0, clientMutationId: randomUUID(), responses: completeResponses }),
    });
    await expectErrorCode(stale, 409, "VERSION_CONFLICT");

    const commandId = randomUUID();
    const completeSave = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: draftIntake.version, clientMutationId: commandId, responses: completeResponses }),
    });
    expect(completeSave.status).toBe(200);
    draftIntake = await responseIntake(completeSave);

    const collision = await authenticatedFetch(environment, clientASession, "/api/v1/client/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: draftIntake.version - 1,
        clientMutationId: commandId,
        responses: { ...completeResponses, whyNow: "Autre requête" },
      }),
    });
    await expectErrorCode(collision, 409, "DUPLICATE");
  });

  it("isole les autres Clients et tout staff non vérifié, non assigné ou inter-organisation", async () => {
    const unverified = await authenticatedFetch(
      environment,
      unverifiedAssignedCoachSession,
      coachPath(clientA.clientId),
    );
    await expectErrorCode(unverified, 403, "FORBIDDEN");

    for (const session of [unassignedCoachSession, crossOrganizationAdminSession]) {
      const denied = await authenticatedFetch(environment, session, coachPath(clientA.clientId));
      const deniedCopy = denied.clone();
      await expectErrorCode(denied, 404, "NOT_FOUND");
      const serialized = JSON.stringify(await deniedCopy.json().catch(() => ({})));
      expect(serialized).not.toContain(PRIVATE_HEALTH_SENTINEL);
    }

    const otherClient = await authenticatedFetch(environment, clientBSession, "/api/v1/client/onboarding");
    const otherIntake = await responseIntake(otherClient);
    expect(otherIntake).toMatchObject({ status: "NOT_STARTED", version: 0 });
    expect(otherIntake.responses.email).toBe(clientB.email);
    expect(JSON.stringify(otherIntake)).not.toContain(PRIVATE_HEALTH_SENTINEL);

    const directOtherRead = await clientBSession.client
      .from("client_onboarding_intakes")
      .select("client_id, status, responses")
      .eq("client_id", clientA.clientId);
    expect(directOtherRead.data ?? []).toHaveLength(0);
    const directCoachDraft = await assignedCoachSession.client
      .from("client_onboarding_intakes")
      .select("client_id, status, responses")
      .eq("client_id", clientA.clientId);
    expect(directCoachDraft.data ?? []).toHaveLength(0);
  });

  it("soumet une fois, reste immuable et révèle le snapshot seulement au staff autorisé", async () => {
    const submitId = randomUUID();
    const payload = { expectedVersion: draftIntake.version, clientMutationId: submitId };
    const submit = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expectPrivateResponse(submit);
    expect(submit.status).toBe(200);
    const submitBody = await submit.clone().json();
    submittedIntake = await responseIntake(submit);
    expect(submittedIntake).toMatchObject({ status: "SUBMITTED", responses: completeResponses });
    expect(submittedIntake.version).toBeGreaterThan(draftIntake.version);

    const retry = await authenticatedFetch(
      environment,
      clientASecondSession,
      "/api/v1/client/onboarding/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(submitBody);

    const mutationAfterSubmit = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: submittedIntake.version,
          clientMutationId: randomUUID(),
          responses: { ...completeResponses, whyNow: "Tentative après transmission" },
        }),
      },
    );
    await expectErrorCode(mutationAfterSubmit, 409, "INVALID_STATE");
    const secondSubmit = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/onboarding/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: submittedIntake.version, clientMutationId: randomUUID() }),
      },
    );
    await expectErrorCode(secondSubmit, 409, "INVALID_STATE");

    for (const session of [assignedCoachSession, organizationAdminSession]) {
      const staffRead = await authenticatedFetch(environment, session, coachPath(clientA.clientId));
      expectPrivateResponse(staffRead);
      expect(staffRead.status).toBe(200);
      const body = (await staffRead.json()) as { data?: { intake?: Intake } };
      expect(body.data?.intake).toMatchObject({
        status: "SUBMITTED",
        version: submittedIntake.version,
        responses: completeResponses,
      });
    }

    const deniedStaff = [
      [unverifiedAssignedCoachSession, 403, "FORBIDDEN"],
      [unassignedCoachSession, 404, "NOT_FOUND"],
      [crossOrganizationAdminSession, 404, "NOT_FOUND"],
    ] as const;
    for (const [session, status, code] of deniedStaff) {
      const denied = await authenticatedFetch(environment, session, coachPath(clientA.clientId));
      const deniedCopy = denied.clone();
      await expectErrorCode(denied, status, code);
      const serialized = await deniedCopy.text();
      expect(serialized).not.toContain(PRIVATE_HEALTH_SENTINEL);
      expect(serialized).not.toContain(PRIVATE_NUTRITION_SENTINEL);
    }
    const otherClientAtStaffBoundary = await authenticatedFetch(
      environment,
      clientBSession,
      coachPath(clientA.clientId),
    );
    await expectErrorCode(otherClientAtStaffBoundary, 403, "FORBIDDEN");

    for (const session of [
      clientBSession,
      unverifiedAssignedCoachSession,
      unassignedCoachSession,
      crossOrganizationAdminSession,
    ]) {
      const directDenied = await session.client
        .from("client_onboarding_intakes")
        .select("client_id, status, responses")
        .eq("client_id", clientA.clientId);
      expect(directDenied.error).toBeNull();
      expect(directDenied.data ?? []).toHaveLength(0);
      expect(JSON.stringify(directDenied.data)).not.toContain(PRIVATE_HEALTH_SENTINEL);
      expect(JSON.stringify(directDenied.data)).not.toContain(PRIVATE_NUTRITION_SENTINEL);
    }

    const admin = createM1AdminClient(environment);
    const persisted = await admin
      .from("client_onboarding_intakes")
      .select("id, client_id, status, row_version, responses, submitted_at")
      .eq("client_id", clientA.clientId);
    expect(persisted.error).toBeNull();
    expect(persisted.data).toHaveLength(1);
    expect(persisted.data?.[0]).toMatchObject({
      client_id: clientA.clientId,
      status: "SUBMITTED",
      row_version: submittedIntake.version,
      responses: completeResponses,
    });
    const intakeId = persisted.data?.[0]?.id;
    expect(intakeId).toEqual(expect.any(String));

    const audits = await admin
      .from("audit_events")
      .select("command, actor_user_id, entity_type, entity_id, context")
      .eq("organization_id", assignedCoach.organizationId)
      .eq("command", "SubmitOnboardingIntake")
      .eq("actor_user_id", clientA.userId)
      .eq("entity_type", "client_onboarding_intake")
      .eq("entity_id", intakeId);
    expect(audits.error).toBeNull();
    expect(audits.data).toHaveLength(1);
    expect(audits.data?.[0]?.context).toEqual({ kind: "ONBOARDING_INTAKE", schemaVersion: 1 });
    expect(JSON.stringify(audits.data)).not.toMatch(
      /fullName|email|phoneNumber|healthNotes|medications|nutrition|ONBOARDING_PRIVATE/i,
    );

    const clientRecord = await admin
      .from("clients")
      .select("email, first_name, last_name, auth_user_id")
      .eq("id", clientA.clientId)
      .single();
    expect(clientRecord.data).toMatchObject({
      email: clientA.email,
      first_name: "Client",
      last_name: "Alpha",
      auth_user_id: clientA.userId,
    });
    expect(completeResponses.email).not.toBe(clientA.email);
    expect(completeResponses.fullName).not.toBe(clientA.displayName);

    const assessmentAfter = await authenticatedFetch(environment, clientASession, "/api/v1/client/week-zero");
    expect(await assessmentAfter.json()).toMatchObject({ data: { assessment: { status: "DRAFT", version: 1 } } });
  });
});
