import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  M1SsrSession,
  authenticatedFetch,
  createM1AdminClient,
  getM1TestEnvironment,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const fixturePassword = "M1-local-only-Week-Zero!123";

type AssessmentStatus = "NOT_STARTED" | "DRAFT" | "SUBMITTED";
type Assessment = Readonly<{
  status: AssessmentStatus;
  version: number;
  responses: unknown;
  [key: string]: unknown;
}>;

type SeededClient = Readonly<{
  clientId: string;
  email: string;
  userId: string;
}>;

const partialResponses = {
  measurements: {
    bodyWeightLb: 214.5,
    waistIn: 41.25,
    chestIn: null,
    hipsIn: null,
    rightArmIn: null,
    rightThighIn: null,
    other: "Poids et tour de taille pris au réveil.",
  },
  mobility: {
    painSquat: "NO",
    painHinge: "NOT_ASSESSED",
    painPush: "NO",
    painPull: "NO",
    painCardio: "NO",
    limitedMovement: "",
    comfortableMovement: "Marche",
    tightArea: "",
  },
  availability: {
    days: ["MONDAY", "WEDNESDAY"],
    bestTime: "06:30",
    sessionDurationMinutes: 40,
    sessionsPerWeek: 3,
    constraints: "Déplacement professionnel le jeudi.",
  },
} as const;

const completeResponses = {
  ...partialResponses,
  measurements: {
    ...partialResponses.measurements,
    chestIn: 43,
    hipsIn: 42.5,
    rightArmIn: 15.25,
    rightThighIn: 24.75,
  },
  mobility: {
    painSquat: "NO",
    painHinge: "YES",
    painPush: "NO",
    painPull: "NO",
    painCardio: "NO",
    limitedMovement: "Charnière de hanches limitée au lever.",
    comfortableMovement: "Marche et poussée horizontale.",
    tightArea: "Ischio-jambier droit.",
  },
} as const;

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
let draftAssessment: Assessment;
let submittedAssessment: Assessment;

function expectPrivateResponse(response: Response): void {
  expect(response.headers.get("cache-control")).toContain("no-store");
}

async function responseAssessment(response: Response): Promise<Assessment> {
  const body = (await response.json()) as { data?: { assessment?: Assessment } };
  expect(body.data?.assessment).toBeTruthy();
  return body.data!.assessment!;
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
    throw new Error("Unable to seed the same-organization Coach fixture");
  }

  const userId = created.data.user.id;
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: userId,
      display_name: input.role === "ADMIN" ? "Admin organisation" : "Coach non assigné",
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

  return {
    userId,
    organizationId: input.organizationId,
    email: input.email,
    password: fixturePassword,
    role: input.role,
  };
}

async function seedClient(input: {
  organizationId: string;
  createdBy: string;
  assignedCoachUserId?: string;
  name: string;
}): Promise<SeededClient> {
  const admin = createM1AdminClient(environment);
  const email = `week-zero.${input.name.toLowerCase()}.${randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: fixturePassword,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error("Unable to seed the Week Zero Client fixture");
  }

  const userId = created.data.user.id;
  const clientId = randomUUID();
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: userId,
      display_name: `Client ${input.name}`,
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

  return { clientId, email, userId };
}

async function signIn(email: string): Promise<M1SsrSession> {
  const session = new M1SsrSession(environment);
  const signInResult = await session.client.auth.signInWithPassword({
    email,
    password: fixturePassword,
  });
  if (signInResult.error) throw signInResult.error;
  return session;
}

async function verifyCoachEmail(
  session: M1SsrSession,
  coach: SeededStaff,
): Promise<void> {
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

function coachAssessmentPath(clientId: string): string {
  return `/api/v1/coach/clients/${encodeURIComponent(clientId)}/week-zero`;
}

describe.sequential("Week Zero persistence and isolation gate", () => {
  beforeAll(async () => {
    assignedCoach = await seedStaffIdentity(environment, {
      email: `week-zero.assigned.${randomUUID()}@example.test`,
      password: fixturePassword,
      role: "COACH",
    });
    unassignedCoach = await seedStaffInOrganization({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      email: `week-zero.unassigned.${randomUUID()}@example.test`,
      role: "COACH",
    });
    organizationAdmin = await seedStaffInOrganization({
      organizationId: assignedCoach.organizationId,
      createdBy: assignedCoach.userId,
      email: `week-zero.org-admin.${randomUUID()}@example.test`,
      role: "ADMIN",
    });
    crossOrganizationAdmin = await seedStaffIdentity(environment, {
      email: `week-zero.cross-org-admin.${randomUUID()}@example.test`,
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

  it("refuse toute lecture Week Zero sans session ou avec un rôle inadéquat", async () => {
    const anonymousClient = await fetch(
      `${environment.appUrl}/api/v1/client/week-zero`,
      { redirect: "manual" },
    );
    await expectErrorCode(anonymousClient, 401, "UNAUTHENTICATED");

    const anonymousCoach = await fetch(
      new URL(coachAssessmentPath(clientA.clientId), environment.appUrl),
      { redirect: "manual" },
    );
    await expectErrorCode(anonymousCoach, 401, "UNAUTHENTICATED");

    const coachAtClientBoundary = await authenticatedFetch(
      environment,
      assignedCoachSession,
      "/api/v1/client/week-zero",
    );
    await expectErrorCode(coachAtClientBoundary, 403, "FORBIDDEN");

    const clientAtCoachBoundary = await authenticatedFetch(
      environment,
      clientASession,
      coachAssessmentPath(clientA.clientId),
    );
    await expectErrorCode(clientAtCoachBoundary, 403, "FORBIDDEN");
  });

  it("retourne un état initial privé et refuse les mutations cross-origin ou surdimensionnées", async () => {
    const initial = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
    );
    expectPrivateResponse(initial);
    expect(initial.status).toBe(200);
    expect(await responseAssessment(initial)).toMatchObject({
      status: "NOT_STARTED",
      version: 0,
    });

    const crossOrigin = await fetch(
      `${environment.appUrl}/api/v1/client/week-zero`,
      {
        method: "PUT",
        headers: {
          cookie: clientASession.cookieHeader(),
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: randomUUID(),
          responses: partialResponses,
        }),
        redirect: "manual",
      },
    );
    await expectErrorCode(crossOrigin, 403, "FORBIDDEN");

    const oversized = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: randomUUID(),
          responses: {
            ...partialResponses,
            availability: {
              ...partialResponses.availability,
              constraints: "x".repeat(33 * 1_024),
            },
          },
        }),
      },
    );
    await expectErrorCode(oversized, 400, "VALIDATION_FAILED");

    const unchanged = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
    );
    expect(await responseAssessment(unchanged)).toMatchObject({
      status: "NOT_STARTED",
      version: 0,
    });
  });

  it("sauvegarde et reprend un brouillon sans jamais le révéler au Coach", async () => {
    const clientMutationId = randomUUID();
    const payload = {
      expectedVersion: 0,
      clientMutationId,
      responses: partialResponses,
    };
    const save = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expectPrivateResponse(save);
    expect(save.status).toBe(200);
    const saveBody = await save.clone().json();
    draftAssessment = await responseAssessment(save);
    expect(draftAssessment).toMatchObject({
      status: "DRAFT",
      version: 1,
      responses: partialResponses,
    });

    const retry = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(saveBody);

    const resume = await authenticatedFetch(
      environment,
      clientASecondSession,
      "/api/v1/client/week-zero",
    );
    expect(resume.status).toBe(200);
    expect(await responseAssessment(resume)).toEqual(draftAssessment);

    const assignedCoachRead = await authenticatedFetch(
      environment,
      assignedCoachSession,
      coachAssessmentPath(clientA.clientId),
    );
    expectPrivateResponse(assignedCoachRead);
    expect(assignedCoachRead.status).toBe(200);
    const coachBody = (await assignedCoachRead.json()) as {
      data?: { assessment?: Assessment };
    };
    expect(coachBody.data?.assessment).toMatchObject({
      status: "NOT_SUBMITTED",
      responses: null,
    });
    expect(JSON.stringify(coachBody)).not.toContain(
      partialResponses.measurements.other,
    );

    const organizationAdminRead = await authenticatedFetch(
      environment,
      organizationAdminSession,
      coachAssessmentPath(clientA.clientId),
    );
    expect(organizationAdminRead.status).toBe(200);
    const adminBody = (await organizationAdminRead.json()) as {
      data?: { assessment?: Assessment };
    };
    expect(adminBody.data?.assessment).toMatchObject({
      status: "NOT_SUBMITTED",
      responses: null,
    });
    expect(JSON.stringify(adminBody)).not.toContain(
      partialResponses.measurements.other,
    );
  });

  it("rejette un brouillon incomplet, un conflit de version et une commande réutilisée différemment", async () => {
    const incomplete = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draftAssessment.version,
          clientMutationId: randomUUID(),
        }),
      },
    );
    await expectErrorCode(incomplete, 400, "VALIDATION_FAILED");

    const stale = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: randomUUID(),
          responses: completeResponses,
        }),
      },
    );
    await expectErrorCode(stale, 409, "VERSION_CONFLICT");

    const reusedMutation = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draftAssessment.version,
          clientMutationId: "00000000-0000-4000-8000-000000000001",
          responses: completeResponses,
        }),
      },
    );
    expect(reusedMutation.status).toBe(200);
    const reusedAssessment = await responseAssessment(reusedMutation);

    const collision = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draftAssessment.version,
          clientMutationId: "00000000-0000-4000-8000-000000000001",
          responses: {
            ...completeResponses,
            availability: {
              ...completeResponses.availability,
              bestTime: "19:00",
            },
          },
        }),
      },
    );
    await expectErrorCode(collision, 409, "DUPLICATE");
    draftAssessment = reusedAssessment;
  });

  it("masque le Client à tout staff non vérifié, non assigné ou d'une autre organisation", async () => {
    const unverified = await authenticatedFetch(
      environment,
      unverifiedAssignedCoachSession,
      coachAssessmentPath(clientA.clientId),
    );
    expectPrivateResponse(unverified);
    expect(unverified.status).toBe(403);

    for (const deniedSession of [unassignedCoachSession, crossOrganizationAdminSession]) {
      const denied = await authenticatedFetch(
        environment,
        deniedSession,
        coachAssessmentPath(clientA.clientId),
      );
      expectPrivateResponse(denied);
      expect(denied.status).toBe(404);
      const serialized = JSON.stringify(await denied.json());
      expect(serialized).not.toMatch(/Client Alpha|week-zero\.alpha/i);
      expect(serialized).not.toContain(partialResponses.measurements.other);
    }

    const otherClientRead = await authenticatedFetch(
      environment,
      clientBSession,
      "/api/v1/client/week-zero",
    );
    expect(otherClientRead.status).toBe(200);
    expect(await responseAssessment(otherClientRead)).toMatchObject({
      status: "NOT_STARTED",
      version: 0,
    });

    const directOtherClientRead = await clientBSession.client
      .from("week_zero_assessments")
      .select("client_id, status, responses")
      .eq("client_id", clientA.clientId);
    expect(directOtherClientRead.data ?? []).toHaveLength(0);
  });

  it("soumet une seule fois un instantané immuable et le révèle au seul Coach assigné", async () => {
    const submitMutationId = randomUUID();
    const payload = {
      expectedVersion: draftAssessment.version,
      clientMutationId: submitMutationId,
    };
    const submit = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expectPrivateResponse(submit);
    expect(submit.status).toBe(200);
    const submitBody = await submit.clone().json();
    submittedAssessment = await responseAssessment(submit);
    expect(submittedAssessment).toMatchObject({
      status: "SUBMITTED",
      responses: completeResponses,
    });
    expect(submittedAssessment.version).toBeGreaterThan(draftAssessment.version);

    const exactRetry = await authenticatedFetch(
      environment,
      clientASecondSession,
      "/api/v1/client/week-zero/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(exactRetry.status).toBe(200);
    expect(await exactRetry.json()).toEqual(submitBody);

    const mutationAfterSubmit = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: submittedAssessment.version,
          clientMutationId: randomUUID(),
          responses: {
            ...completeResponses,
            measurements: {
              ...completeResponses.measurements,
              bodyWeightLb: 199,
            },
          },
        }),
      },
    );
    await expectErrorCode(mutationAfterSubmit, 409, "INVALID_STATE");

    const secondSubmission = await authenticatedFetch(
      environment,
      clientASession,
      "/api/v1/client/week-zero/submit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: submittedAssessment.version,
          clientMutationId: randomUUID(),
        }),
      },
    );
    await expectErrorCode(secondSubmission, 409, "INVALID_STATE");

    const assignedCoachRead = await authenticatedFetch(
      environment,
      assignedCoachSession,
      coachAssessmentPath(clientA.clientId),
    );
    expectPrivateResponse(assignedCoachRead);
    expect(assignedCoachRead.status).toBe(200);
    const coachBody = (await assignedCoachRead.json()) as {
      data?: {
        client?: { id?: unknown; displayName?: unknown; email?: unknown };
        assessment?: Assessment;
      };
    };
    expect(coachBody.data?.client?.id).toBe(clientA.clientId);
    expect(coachBody.data?.assessment).toMatchObject({
      status: "SUBMITTED",
      version: submittedAssessment.version,
      responses: completeResponses,
    });

    const organizationAdminRead = await authenticatedFetch(
      environment,
      organizationAdminSession,
      coachAssessmentPath(clientA.clientId),
    );
    expectPrivateResponse(organizationAdminRead);
    expect(organizationAdminRead.status).toBe(200);
    const adminBody = (await organizationAdminRead.json()) as {
      data?: { assessment?: Assessment };
    };
    expect(adminBody.data?.assessment).toMatchObject({
      status: "SUBMITTED",
      version: submittedAssessment.version,
      responses: completeResponses,
    });

    const admin = createM1AdminClient(environment);
    const persisted = await admin
      .from("week_zero_assessments")
      .select("id, client_id, status, row_version, responses, submitted_at")
      .eq("client_id", clientA.clientId);
    expect(persisted.error).toBeNull();
    expect(persisted.data).toHaveLength(1);
    expect(persisted.data?.[0]).toMatchObject({
      client_id: clientA.clientId,
      status: "SUBMITTED",
      row_version: submittedAssessment.version,
      responses: completeResponses,
    });
    expect(persisted.data?.[0]?.submitted_at).toEqual(expect.any(String));
    const assessmentId = persisted.data?.[0]?.id;
    expect(assessmentId).toEqual(expect.any(String));

    const submissionAudits = await admin
      .from("audit_events")
      .select("command, actor_user_id, entity_type, entity_id")
      .eq("organization_id", assignedCoach.organizationId)
      .eq("command", "SubmitInitialAssessment")
      .eq("actor_user_id", clientA.userId)
      .eq("entity_type", "week_zero_assessment")
      .eq("entity_id", assessmentId);
    expect(submissionAudits.error).toBeNull();
    expect(submissionAudits.data).toHaveLength(1);
  });
});
