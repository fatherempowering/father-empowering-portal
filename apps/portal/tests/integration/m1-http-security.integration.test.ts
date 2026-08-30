import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  M1SsrSession,
  authenticatedFetch,
  createM1AdminClient,
  enrollAndVerifyTotp,
  getM1TestEnvironment,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";

const environment = getM1TestEnvironment();
const password = "M1-local-only-Max!123";
let coach: SeededStaff;
let session: M1SsrSession;
let authenticatedCoachUserId: string | null = null;

describe.sequential("M1 HTTP security and transaction integration", () => {
  beforeAll(async () => {
    coach = await seedStaffIdentity(environment, {
      email: `max.integration.${randomUUID()}@example.test`,
      password,
      role: "COACH",
    });
    session = new M1SsrSession(environment);
    const signIn = await session.client.auth.signInWithPassword({
      email: coach.email,
      password,
    });
    if (signIn.error) throw signIn.error;
    authenticatedCoachUserId = signIn.data.user?.id ?? null;
  });

  it("authentifie par email un Coach créé par service_role", () => {
    expect(authenticatedCoachUserId).toBe(coach.userId);
  });

  it("interdit toujours le signup email public", async () => {
    const signupEmail = `blocked.signup.${randomUUID()}@example.test`;
    const anonymousSession = new M1SsrSession(environment);
    const signup = await anonymousSession.client.auth.signUp({
      email: signupEmail,
      password: "M1-local-only-anonymous!123",
    });

    expect(signup.error?.code).toBe("signup_disabled");
    expect(signup.data.user).toBeNull();
    expect(signup.data.session).toBeNull();

    const listedUsers = await createM1AdminClient(environment).auth.admin.listUsers();
    if (listedUsers.error) throw listedUsers.error;
    expect(listedUsers.data.users.some((user) => user.email === signupEmail)).toBe(false);
  });

  it("refuse les routes privées sans session", async () => {
    const coachResponse = await fetch(`${environment.appUrl}/api/v1/coach/clients`, {
      redirect: "manual",
    });
    const clientResponse = await fetch(`${environment.appUrl}/api/v1/client/me`, {
      redirect: "manual",
    });

    expect(coachResponse.status).toBe(401);
    expect(clientResponse.status).toBe(401);
  });

  it("refuse le déclenchement du worker sans son secret interne", async () => {
    const missingSecret = await fetch(`${environment.appUrl}/api/v1/internal/outbox`, {
      method: "POST",
      redirect: "manual",
    });
    const invalidSecret = await fetch(`${environment.appUrl}/api/v1/internal/outbox`, {
      method: "POST",
      headers: { authorization: "Bearer m1-invalid-worker-secret" },
      redirect: "manual",
    });

    expect(missingSecret.status).toBe(401);
    expect(invalidSecret.status).toBe(401);
  });

  it("refuse un Coach aal1 même avec un membership valide", async () => {
    const read = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
    );
    const mutation = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Aal",
          lastName: "One",
          email: `aal1.${randomUUID()}@example.test`,
          locale: "fr",
          timezone: "America/Montreal",
          clientMutationId: randomUUID(),
        }),
      },
    );

    expect(read.status).toBe(403);
    expect(mutation.status).toBe(403);
    expect(JSON.stringify(await mutation.json())).toMatch(/MFA|FORBIDDEN/i);
  });

  it("crée le parcours invitation de manière atomique et idempotente à aal2", async () => {
    await enrollAndVerifyTotp(session);

    const aal2Boundary = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
    );
    expect(aal2Boundary.status).toBe(200);

    const clientMutationId = randomUUID();
    const clientEmail = `vertical.integration.${randomUUID()}@example.test`;
    const payload = {
      firstName: "Vertical",
      lastName: "Integration",
      email: clientEmail,
      locale: "fr",
      timezone: "America/Montreal",
      clientMutationId,
    };

    const first = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const serialized = JSON.stringify(firstBody);
    expect(serialized).not.toMatch(/opaqueToken|rawToken|invitationToken|tokenHash|token_hash/i);

    const retry = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(firstBody);

    const conflict = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, email: `conflict.${randomUUID()}@example.test` }),
      },
    );
    expect(conflict.status).toBe(409);

    const admin = createM1AdminClient(environment);
    const clients = await admin
      .from("clients")
      .select("id")
      .eq("organization_id", coach.organizationId)
      .eq("email", clientEmail);
    const assignments = await admin
      .from("coach_client_assignments")
      .select("id")
      .eq("organization_id", coach.organizationId)
      .eq("coach_user_id", coach.userId)
      .eq("client_id", firstBody.data.client.id);
    const invitations = await admin
      .from("client_invitations")
      .select("id, token_hash")
      .eq("organization_id", coach.organizationId)
      .eq("client_id", firstBody.data.client.id);
    const audits = await admin
      .from("audit_events")
      .select("id, command, context")
      .eq("organization_id", coach.organizationId)
      .eq("entity_id", firstBody.data.client.id);

    for (const result of [clients, assignments, invitations, audits]) {
      expect(result.error).toBeNull();
    }
    expect(clients.data).toHaveLength(1);
    expect(assignments.data).toHaveLength(1);
    expect(invitations.data).toHaveLength(1);
    expect(invitations.data?.[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(audits.data?.filter((audit) => audit.command === "CreateInvitedClient")).toHaveLength(1);
  });
});
