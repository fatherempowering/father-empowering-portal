import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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
const clientPassword = "M1-local-only-Client!123";
let coach: SeededStaff;
let session: M1SsrSession;
let clientSessionA: M1SsrSession;
let clientSessionB: M1SsrSession;
let sessionClientEmail: string;
let authenticatedCoachUserId: string | null = null;

function safeErrorDiagnostic(body: unknown): { code: string; message: string } {
  if (!body || typeof body !== "object") {
    return { code: "UNAVAILABLE", message: "Unavailable" };
  }

  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return { code: "UNAVAILABLE", message: "Unavailable" };
  }

  const fields = error as { code?: unknown; message?: unknown };
  return {
    code: typeof fields.code === "string" ? fields.code : "UNAVAILABLE",
    message: typeof fields.message === "string" ? fields.message : "Unavailable",
  };
}

async function localMailCount(recipient: string): Promise<number> {
  const query = encodeURIComponent(`to:${recipient}`);
  const response = await fetch(`${environment.mailpitUrl}/api/v1/search?query=${query}`);
  if (!response.ok) throw new Error("Unable to inspect the local mail boundary");
  const body = (await response.json()) as { messages?: unknown[] };
  return Array.isArray(body.messages) ? body.messages.length : 0;
}

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

    const admin = createM1AdminClient(environment);
    sessionClientEmail = `client.session.${randomUUID()}@example.test`;
    const createdClientUser = await admin.auth.admin.createUser({
      email: sessionClientEmail,
      password: clientPassword,
      email_confirm: true,
      app_metadata: { m1_test_fixture: true },
    });
    if (createdClientUser.error || !createdClientUser.data.user) {
      throw new Error("Unable to seed the Client session fixture");
    }
    const clientUserId = createdClientUser.data.user.id;
    const clientId = randomUUID();
    const clientFixtureWrites = await Promise.all([
      admin.from("profiles").insert({
        auth_user_id: clientUserId,
        display_name: "Client Session",
        locale: "fr-CA",
        time_zone: "America/Montreal",
        status: "ACTIVE",
        created_by: coach.userId,
      }),
      admin.from("organization_memberships").insert({
        organization_id: coach.organizationId,
        user_id: clientUserId,
        role: "CLIENT",
        status: "ACTIVE",
        activated_at: new Date().toISOString(),
        created_by: coach.userId,
      }),
      admin.from("clients").insert({
        id: clientId,
        organization_id: coach.organizationId,
        auth_user_id: clientUserId,
        email: sessionClientEmail,
        first_name: "Client",
        last_name: "Session",
        locale: "fr-CA",
        time_zone: "America/Montreal",
        status: "ACTIVE",
        created_by: coach.userId,
      }),
    ]);
    for (const write of clientFixtureWrites) {
      if (write.error) throw write.error;
    }

    clientSessionA = new M1SsrSession(environment);
    const clientSignInA = await clientSessionA.client.auth.signInWithPassword({
      email: sessionClientEmail,
      password: clientPassword,
    });
    if (clientSignInA.error) throw clientSignInA.error;

    clientSessionB = new M1SsrSession(environment);
    const clientSignInB = await clientSessionB.client.auth.signInWithPassword({
      email: sessionClientEmail,
      password: clientPassword,
    });
    if (clientSignInB.error) throw clientSignInB.error;
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

  it("fait tourner les cookies Client sans OTP et révoque seulement la session locale", async () => {
    const mailCountBeforeRefresh = await localMailCount(sessionClientEmail);
    const cookieBeforeRefreshA = clientSessionA.cookieHeader();
    const refreshA = await clientSessionA.client.auth.refreshSession();
    expect(refreshA.error).toBeNull();
    expect(Boolean(refreshA.data.session)).toBe(true);
    expect(clientSessionA.cookieHeader() !== cookieBeforeRefreshA).toBe(true);
    const retainedRefreshTokenA = refreshA.data.session?.refresh_token;
    if (!retainedRefreshTokenA) {
      throw new Error("The refreshed Client session has no refresh credential");
    }

    const afterRefreshA = await authenticatedFetch(
      environment,
      clientSessionA,
      "/api/v1/client/me",
    );
    expect(afterRefreshA.status).toBe(200);
    expect(await localMailCount(sessionClientEmail)).toBe(mailCountBeforeRefresh);

    const beforeLogoutB = await authenticatedFetch(
      environment,
      clientSessionB,
      "/api/v1/client/me",
    );
    expect(beforeLogoutB.status).toBe(200);

    const crossOriginLogout = await fetch(
      `${environment.appUrl}/api/v1/auth/client-logout`,
      {
        method: "POST",
        headers: {
          cookie: clientSessionA.cookieHeader(),
          origin: "https://attacker.example",
        },
        redirect: "manual",
      },
    );
    expect(crossOriginLogout.status).toBe(403);

    const logout = await authenticatedFetch(
      environment,
      clientSessionA,
      "/api/v1/auth/client-logout",
      { method: "POST" },
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("cache-control")).toContain("no-store");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await logout.json()).toEqual({
      data: { signedOut: true, redirectTo: "/client-login" },
    });

    const afterLogoutB = await authenticatedFetch(
      environment,
      clientSessionB,
      "/api/v1/client/me",
    );
    expect(afterLogoutB.status).toBe(200);
    const cookieBeforeRefreshB = clientSessionB.cookieHeader();
    const refreshB = await clientSessionB.client.auth.refreshSession();
    expect(refreshB.error).toBeNull();
    expect(Boolean(refreshB.data.session)).toBe(true);
    expect(clientSessionB.cookieHeader() !== cookieBeforeRefreshB).toBe(true);
    const afterRefreshB = await authenticatedFetch(
      environment,
      clientSessionB,
      "/api/v1/client/me",
    );
    expect(afterRefreshB.status).toBe(200);
    expect(await localMailCount(sessionClientEmail)).toBe(mailCountBeforeRefresh);

    const revokedSessionProbe = createClient(
      environment.supabaseUrl,
      environment.anonKey,
      { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
    );
    const replayA = await revokedSessionProbe.auth.refreshSession({
      refresh_token: retainedRefreshTokenA,
    });
    expect(replayA.error !== null).toBe(true);
    expect(replayA.data.session).toBeNull();
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
    const firstDiagnosticBody: unknown = await first.clone().json().catch(() => null);
    const firstDiagnostic = safeErrorDiagnostic(firstDiagnosticBody);
    expect(
      first.status,
      `POST /api/v1/coach/clients failed: error.code=${JSON.stringify(firstDiagnostic.code)}; error.message=${JSON.stringify(firstDiagnostic.message)}`,
    ).toBe(201);
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
    const retryBody = await retry.json();
    const firstInvitation = firstBody.data.invitation;
    const retryInvitation = retryBody.data.invitation;

    expect({
      ...retryBody,
      data: {
        ...retryBody.data,
        invitation: {
          ...retryInvitation,
          status: firstInvitation.status,
          sentAt: firstInvitation.sentAt,
        },
      },
    }).toEqual(firstBody);

    for (const invitation of [firstInvitation, retryInvitation]) {
      expect(["PENDING", "SENT"]).toContain(invitation.status);
      if (invitation.status === "PENDING") {
        expect(invitation.sentAt).toBeNull();
      } else {
        expect(typeof invitation.sentAt).toBe("string");
        expect(Number.isNaN(Date.parse(invitation.sentAt))).toBe(false);
      }
    }
    expect(
      firstInvitation.status === "SENT" && retryInvitation.status === "PENDING",
    ).toBe(false);

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
