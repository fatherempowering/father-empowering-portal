import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EMPTY_ONBOARDING_RESPONSES,
  type OnboardingResponses,
} from "@/lib/contracts/onboarding";
import { EMPTY_INITIAL_ASSESSMENT_RESPONSES } from "@/lib/contracts/week-zero";
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
const fixturePassword = "M1-local-only-Personal!123";
const OTHER_CLIENT_SENTINEL = "OTHER_CLIENT_PRIVATE_PERSONAL_PORTAL_SENTINEL";

type SeededClient = Readonly<{
  clientId: string;
  email: string;
  userId: string;
}>;

type PersonalClientResponse = Readonly<{
  data?: { clientId?: unknown; redirectTo?: unknown };
}>;

let owner: SeededStaff;
let otherClient: SeededClient;
let unverifiedOwnerSession: M1SsrSession;
let verifiedOwnerSession: M1SsrSession;
let normalClientSession: M1SsrSession;
let personalClientId: string;
let personalIdempotencyKey: string;
const usedMailIds = new Set<string>();

function expectPrivateResponse(response: Response): void {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
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

async function signInWithPassword(email: string): Promise<M1SsrSession> {
  const session = new M1SsrSession(environment);
  const result = await session.client.auth.signInWithPassword({
    email,
    password: fixturePassword,
  });
  if (result.error || !result.data.session) {
    throw new Error(`Unable to sign in test identity: ${result.error?.message ?? "unknown"}`);
  }
  return session;
}

async function verifyStaffEmail(
  session: M1SsrSession,
  staff: SeededStaff,
): Promise<void> {
  const request = await authenticatedFetch(
    environment,
    session,
    "/api/v1/auth/coach-email-otp/request",
    { method: "POST" },
  );
  expect(request.status).toBe(202);
  const mail = await waitForMail(
    environment.mailpitUrl,
    staff.email,
    (message) => {
      try {
        extractSixDigitOtp(message);
        return true;
      } catch {
        return false;
      }
    },
    { excludeIds: usedMailIds },
  );
  usedMailIds.add(mail.id);
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

async function seedNormalClient(): Promise<SeededClient> {
  const admin = createM1AdminClient(environment);
  const email = `staff-own.other-client.${randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: fixturePassword,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error("Unable to seed the normal Client identity");
  }

  const userId = created.data.user.id;
  const clientId = randomUUID();
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: userId,
      display_name: "Other private Client",
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: owner.userId,
    }),
    admin.from("organization_memberships").insert({
      organization_id: owner.organizationId,
      user_id: userId,
      role: "CLIENT",
      status: "ACTIVE",
      activated_at: new Date().toISOString(),
      created_by: owner.userId,
    }),
    admin.from("clients").insert({
      id: clientId,
      organization_id: owner.organizationId,
      auth_user_id: userId,
      email,
      first_name: "Other",
      last_name: "Private Client",
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: owner.userId,
    }),
  ]);
  for (const write of writes) {
    if (write.error) throw write.error;
  }

  const otherOnboarding = structuredClone(
    EMPTY_ONBOARDING_RESPONSES,
  ) as OnboardingResponses;
  otherOnboarding.fullName = OTHER_CLIENT_SENTINEL;
  otherOnboarding.email = email;
  const submittedAt = new Date().toISOString();
  const privateRows = await Promise.all([
    admin.from("coach_client_assignments").insert({
      organization_id: owner.organizationId,
      coach_user_id: owner.userId,
      client_id: clientId,
      is_primary: true,
      status: "ACTIVE",
      created_by: owner.userId,
    }),
    admin.from("client_onboarding_intakes").insert({
      organization_id: owner.organizationId,
      client_id: clientId,
      responses: otherOnboarding,
      status: "SUBMITTED",
      submitted_at: submittedAt,
      submitted_by: userId,
    }),
    admin.from("week_zero_assessments").insert({
      organization_id: owner.organizationId,
      client_id: clientId,
      responses: {
        ...structuredClone(EMPTY_INITIAL_ASSESSMENT_RESPONSES),
        measurements: {
          ...EMPTY_INITIAL_ASSESSMENT_RESPONSES.measurements,
          other: OTHER_CLIENT_SENTINEL,
        },
      },
      status: "SUBMITTED",
      submitted_at: submittedAt,
      submitted_by: userId,
    }),
  ]);
  for (const write of privateRows) {
    if (write.error) throw write.error;
  }

  return { clientId, email, userId };
}

function personalProfileBody(idempotencyKey: string) {
  return {
    firstName: "Max",
    lastName: "Personnel",
    locale: "fr-CA" as const,
    timeZone: "America/Montreal",
    idempotencyKey,
  };
}

describe.sequential("verified Staff personal Client capability gate", () => {
  beforeAll(async () => {
    owner = await seedStaffIdentity(environment, {
      email: `staff-own.owner.${randomUUID()}@example.test`,
      password: fixturePassword,
      role: "COACH",
    });
    otherClient = await seedNormalClient();
    unverifiedOwnerSession = await signInWithPassword(owner.email);
    verifiedOwnerSession = await signInWithPassword(owner.email);
    normalClientSession = await signInWithPassword(otherClient.email);
  }, 90_000);

  it("refuse anonymous, wrong-origin and password-only Staff setup or own access", async () => {
    personalIdempotencyKey = randomUUID();
    const anonymous = await fetch(
      new URL("/api/v1/coach/personal-client", environment.appUrl),
      {
        method: "POST",
        headers: {
          origin: environment.appUrl,
          "content-type": "application/json",
        },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    await expectErrorCode(anonymous, 401, "UNAUTHENTICATED");

    const missingOrigin = await fetch(
      new URL("/api/v1/coach/personal-client", environment.appUrl),
      {
        method: "POST",
        headers: {
          cookie: unverifiedOwnerSession.cookieHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    await expectErrorCode(missingOrigin, 403, "FORBIDDEN");

    const unverifiedSetup = await authenticatedFetch(
      environment,
      unverifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    await expectErrorCode(unverifiedSetup, 403, "FORBIDDEN");

    const unverifiedOwn = await authenticatedFetch(
      environment,
      unverifiedOwnerSession,
      "/api/v1/client/me",
    );
    await expectErrorCode(unverifiedOwn, 403, "FORBIDDEN");

    const admin = createM1AdminClient(environment);
    const beforeVerification = await admin
      .from("clients")
      .select("id")
      .eq("auth_user_id", owner.userId);
    expect(beforeVerification.error).toBeNull();
    expect(beforeVerification.data).toHaveLength(0);
  });

  it("crée exactement un profil personnel idempotent sans changer le rôle Staff", async () => {
    await verifyStaffEmail(verifiedOwnerSession, owner);

    const queryRejected = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      `/api/v1/coach/personal-client?clientId=${otherClient.clientId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    await expectErrorCode(queryRejected, 400, "VALIDATION_FAILED");

    const extraClientId = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...personalProfileBody(personalIdempotencyKey),
          clientId: otherClient.clientId,
        }),
      },
    );
    await expectErrorCode(extraClientId, 400, "VALIDATION_FAILED");

    const create = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    expectPrivateResponse(create);
    expect(create.status).toBe(201);
    const created = (await create.json()) as PersonalClientResponse;
    expect(created.data?.redirectTo).toBe("/client");
    expect(typeof created.data?.clientId).toBe("string");
    personalClientId = created.data!.clientId as string;

    const retry = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(personalIdempotencyKey)),
      },
    );
    expect(retry.status).toBe(201);
    expect((await retry.json()) as PersonalClientResponse).toEqual(created);

    const collision = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...personalProfileBody(personalIdempotencyKey),
          lastName: "Collision",
        }),
      },
    );
    await expectErrorCode(collision, 409, "INVALID_STATE");

    const secondProfile = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(randomUUID())),
      },
    );
    await expectErrorCode(secondProfile, 409, "INVALID_STATE");

    const admin = createM1AdminClient(environment);
    const [clients, memberships, assignments, invitations, outbox] = await Promise.all([
      admin
        .from("clients")
        .select("id, organization_id, auth_user_id, email, status")
        .eq("auth_user_id", owner.userId),
      admin
        .from("organization_memberships")
        .select("role, status")
        .eq("organization_id", owner.organizationId)
        .eq("user_id", owner.userId),
      admin.from("coach_client_assignments").select("id").eq("client_id", personalClientId),
      admin.from("client_invitations").select("id").eq("client_id", personalClientId),
      admin.from("outbox_events").select("id").eq("aggregate_id", personalClientId),
    ]);
    for (const result of [clients, memberships, assignments, invitations, outbox]) {
      expect(result.error).toBeNull();
    }
    expect(clients.data).toEqual([
      expect.objectContaining({
        id: personalClientId,
        organization_id: owner.organizationId,
        auth_user_id: owner.userId,
        email: owner.email,
        status: "ACTIVE",
      }),
    ]);
    expect(memberships.data).toEqual([{ role: "COACH", status: "ACTIVE" }]);
    expect(assignments.data).toHaveLength(0);
    expect(invitations.data).toHaveLength(0);
    expect(outbox.data).toHaveLength(0);
  });

  it("alterne Coach et own Client avec le même cookie sans fuite horizontale", async () => {
    const coachBefore = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/clients",
    );
    expect(coachBefore.status).toBe(200);

    const assignedCoachView = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      `/api/v1/coach/clients/${otherClient.clientId}/onboarding`,
    );
    expect(assignedCoachView.status).toBe(200);
    expect(await assignedCoachView.text()).toContain(OTHER_CLIENT_SENTINEL);

    const profile = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      `/api/v1/client/me?clientId=${otherClient.clientId}`,
    );
    expectPrivateResponse(profile);
    expect(profile.status).toBe(200);
    const profileText = await profile.text();
    expect(profileText).toContain(personalClientId);
    expect(profileText).not.toContain(otherClient.clientId);
    expect(profileText).not.toContain(OTHER_CLIENT_SENTINEL);

    const onboardingInitial = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      `/api/v1/client/onboarding?clientId=${otherClient.clientId}`,
    );
    expectPrivateResponse(onboardingInitial);
    expect(onboardingInitial.status).toBe(200);
    const onboardingBody = (await onboardingInitial.json()) as {
      data?: { intake?: { version?: number; responses?: OnboardingResponses } };
    };
    expect(onboardingBody.data?.intake?.version).toBe(0);
    expect(JSON.stringify(onboardingBody)).not.toContain(OTHER_CLIENT_SENTINEL);

    const onboardingResponses = structuredClone(
      onboardingBody.data!.intake!.responses!,
    );
    onboardingResponses.fullName = "Max Personnel";
    onboardingResponses.email = owner.email;
    const onboardingMutationId = randomUUID();
    const onboardingInjection = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/client/onboarding",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: onboardingMutationId,
          responses: onboardingResponses,
          clientId: otherClient.clientId,
        }),
      },
    );
    await expectErrorCode(onboardingInjection, 400, "VALIDATION_FAILED");
    const onboardingSave = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/client/onboarding",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: onboardingMutationId,
          responses: onboardingResponses,
        }),
      },
    );
    expect(onboardingSave.status).toBe(200);

    const assessmentInitial = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      `/api/v1/client/week-zero?clientId=${otherClient.clientId}`,
    );
    expectPrivateResponse(assessmentInitial);
    expect(assessmentInitial.status).toBe(200);
    const assessmentBody = (await assessmentInitial.json()) as {
      data?: { assessment?: { version?: number } };
    };
    expect(assessmentBody.data?.assessment?.version).toBe(0);
    expect(JSON.stringify(assessmentBody)).not.toContain(OTHER_CLIENT_SENTINEL);

    const assessmentMutationId = randomUUID();
    const assessmentInjection = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: assessmentMutationId,
          responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
          clientId: otherClient.clientId,
        }),
      },
    );
    await expectErrorCode(assessmentInjection, 400, "VALIDATION_FAILED");
    const assessmentSave = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/client/week-zero",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          clientMutationId: assessmentMutationId,
          responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
        }),
      },
    );
    expect(assessmentSave.status).toBe(200);

    const directOtherOnboarding = await verifiedOwnerSession.client
      .from("client_onboarding_intakes")
      .select("client_id")
      .eq("client_id", otherClient.clientId);
    const directOtherAssessment = await verifiedOwnerSession.client
      .from("week_zero_assessments")
      .select("client_id, responses")
      .eq("client_id", otherClient.clientId);
    expect(directOtherOnboarding.error).toBeNull();
    expect(directOtherOnboarding.data).toHaveLength(1);
    expect(directOtherAssessment.error).toBeNull();
    expect(directOtherAssessment.data).toHaveLength(1);
    expect(JSON.stringify(directOtherAssessment.data)).toContain(
      OTHER_CLIENT_SENTINEL,
    );

    const coachAfter = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/clients",
    );
    expect(coachAfter.status).toBe(200);
  });

  it("garde le Client normal inchangé et lui interdit le setup Staff", async () => {
    const own = await authenticatedFetch(
      environment,
      normalClientSession,
      "/api/v1/client/me",
    );
    expect(own.status).toBe(200);
    const ownText = await own.text();
    expect(ownText).toContain(otherClient.clientId);
    expect(ownText).not.toContain(personalClientId);

    const coach = await authenticatedFetch(
      environment,
      normalClientSession,
      "/api/v1/coach/clients",
    );
    await expectErrorCode(coach, 403, "FORBIDDEN");

    const setup = await authenticatedFetch(
      environment,
      normalClientSession,
      "/api/v1/coach/personal-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personalProfileBody(randomUUID())),
      },
    );
    await expectErrorCode(setup, 403, "FORBIDDEN");
  });

  it("refuse une session Staff email-OTP sans mot de passe puis la révocation", async () => {
    const otpSession = new M1SsrSession(environment);
    const otpRequest = await otpSession.client.auth.signInWithOtp({
      email: owner.email,
      options: { shouldCreateUser: false },
    });
    expect(otpRequest.error).toBeNull();
    const otpMail = await waitForMail(
      environment.mailpitUrl,
      owner.email,
      (message) => {
        try {
          extractSixDigitOtp(message);
          return true;
        } catch {
          return false;
        }
      },
      { excludeIds: usedMailIds },
    );
    usedMailIds.add(otpMail.id);
    const otpVerification = await otpSession.client.auth.verifyOtp({
      email: owner.email,
      token: extractSixDigitOtp(otpMail),
      type: "email",
    });
    expect(otpVerification.error).toBeNull();

    const otpOwn = await authenticatedFetch(
      environment,
      otpSession,
      "/api/v1/client/me",
    );
    await expectErrorCode(otpOwn, 401, "UNAUTHENTICATED");
    const otpCoach = await authenticatedFetch(
      environment,
      otpSession,
      "/api/v1/coach/clients",
    );
    await expectErrorCode(otpCoach, 401, "UNAUTHENTICATED");

    const revoke = await verifiedOwnerSession.client.rpc(
      "revoke_current_coach_email_attestation",
    );
    expect(revoke.error).toBeNull();
    const revokedOwn = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/client/me",
    );
    await expectErrorCode(revokedOwn, 403, "FORBIDDEN");
    const revokedCoach = await authenticatedFetch(
      environment,
      verifiedOwnerSession,
      "/api/v1/coach/clients",
    );
    await expectErrorCode(revokedCoach, 403, "FORBIDDEN");
  }, 90_000);

  it("audite le créateur Staff réel sans donnée Client et ne crée aucun second rôle", async () => {
    const admin = createM1AdminClient(environment);
    const audit = await admin
      .from("audit_events")
      .select("actor_user_id, actor_role, command, entity_type, entity_id, result, reason, context")
      .eq("entity_id", personalClientId)
      .eq("actor_user_id", owner.userId);
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]).toMatchObject({
      actor_user_id: owner.userId,
      actor_role: "COACH",
      command: "CreateOwnClientProfile",
      entity_type: "client",
      entity_id: personalClientId,
      result: "SUCCEEDED",
      reason: null,
      context: { surface: "STAFF_SELF_CLIENT" },
    });
    const serializedContext = JSON.stringify(audit.data?.[0]?.context ?? {});
    expect(serializedContext).not.toContain(owner.email);
    expect(serializedContext).not.toContain("Max");
    expect(serializedContext).not.toContain("Personnel");
    expect(serializedContext).not.toContain(OTHER_CLIENT_SENTINEL);

    const memberships = await admin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", owner.organizationId)
      .eq("user_id", owner.userId);
    expect(memberships.error).toBeNull();
    expect(memberships.data).toEqual([{ role: "COACH" }]);
  });
});
