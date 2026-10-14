import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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
import { newProgram, newSession, newBlock, addLibraryExercise } from "../../src/lib/training/program-editor";

const environment = getM1TestEnvironment();
const password = "M1-local-only-Max!123";
const clientPassword = "M1-local-only-Client!123";
let coach: SeededStaff;
let session: M1SsrSession;
let unverifiedCoachSession: M1SsrSession;
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

async function verifyCoachEmailSession(
  coachSession: M1SsrSession,
  email: string,
): Promise<string> {
  const request = await authenticatedFetch(
    environment,
    coachSession,
    "/api/v1/auth/coach-email-otp/request",
    { method: "POST" },
  );
  expect(request.status).toBe(202);
  expect(request.headers.get("cache-control")).toContain("no-store");

  const mail = await waitForMail(
    environment.mailpitUrl,
    email,
    (message) => {
      try {
        extractSixDigitOtp(message);
        return true;
      } catch {
        return false;
      }
    },
  );
  const code = extractSixDigitOtp(mail);
  const verification = await authenticatedFetch(
    environment,
    coachSession,
    "/api/v1/auth/coach-email-otp/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    },
  );
  expect(verification.status).toBe(200);
  expect(verification.headers.get("cache-control")).toContain("no-store");
  expect(await verification.json()).toEqual({
    data: { verified: true, redirectTo: "/coach" },
  });
  return code;
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

    unverifiedCoachSession = new M1SsrSession(environment);
    const unverifiedSignIn = await unverifiedCoachSession.client.auth.signInWithPassword({
      email: coach.email,
      password,
    });
    if (unverifiedSignIn.error) throw unverifiedSignIn.error;

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

  it("refuse le mot de passe seul même avec un membership Coach valide", async () => {
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
    expect(JSON.stringify(await mutation.json())).toMatch(
      /COACH_EMAIL_VERIFICATION_REQUIRED|FORBIDDEN/i,
    );
  });

  it("refuse une session email OTP qui ne contient aucune preuve de mot de passe", async () => {
    const otpOnlyCoach = await seedStaffIdentity(environment, {
      email: `otp-only.${randomUUID()}@example.test`,
      password,
      role: "COACH",
    });
    const otpOnlySession = new M1SsrSession(environment);
    const otpRequest = await otpOnlySession.client.auth.signInWithOtp({
      email: otpOnlyCoach.email,
      options: { shouldCreateUser: false },
    });
    expect(otpRequest.error).toBeNull();
    const otpMail = await waitForMail(
      environment.mailpitUrl,
      otpOnlyCoach.email,
      (message) => {
        try {
          extractSixDigitOtp(message);
          return true;
        } catch {
          return false;
        }
      },
    );
    const otpVerification = await otpOnlySession.client.auth.verifyOtp({
      email: otpOnlyCoach.email,
      token: extractSixDigitOtp(otpMail),
      type: "email",
    });
    expect(otpVerification.error).toBeNull();

    const forbidden = await authenticatedFetch(
      environment,
      otpOnlySession,
      "/api/v1/coach/clients",
    );
    expect(forbidden.status).toBe(401);
  });

  it("crée le parcours invitation après le code courriel lié à la session", async () => {
    const consumedCode = await verifyCoachEmailSession(session, coach.email);

    const verifiedBoundary = await authenticatedFetch(
      environment,
      session,
      "/api/v1/coach/clients",
    );
    expect(verifiedBoundary.status).toBe(200);
    const otherPasswordSession = await authenticatedFetch(
      environment,
      unverifiedCoachSession,
      "/api/v1/coach/clients",
    );
    expect(otherPasswordSession.status).toBe(403);
    const replay = await authenticatedFetch(
      environment,
      session,
      "/api/v1/auth/coach-email-otp/verify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: consumedCode }),
      },
    );
    expect(replay.status).toBe(401);

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

  it("saves private program drafts through HTTP with version and retry protection", async () => {
    const path="/api/v1/coach/programs";
    const draft=newProgram(); draft.title.fr="HTTP draft";
    const command={id:null,expectedVersion:0,clientMutationId:randomUUID(),document:draft};
    for(const denied of [unverifiedCoachSession,clientSessionB]) {
      expect((await authenticatedFetch(environment,denied,path)).status).toBe(403);
      expect((await authenticatedFetch(environment,denied,path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(command)})).status).toBe(403);
    }
    expect((await fetch(`${environment.appUrl}${path}`)).status).toBe(401);
    const save=(body:unknown)=>authenticatedFetch(environment,session,path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const created=await save(command); expect(created.status).toBe(200); expect(created.headers.get("cache-control")).toContain("no-store");
    const first=(await created.json()).data.program;expect(first.version).toBe(1);
    const replay=await save(command);expect(replay.status).toBe(200);expect((await replay.json()).data.program).toEqual(first);
    const exerciseResponse=await authenticatedFetch(environment,session,"/api/v1/coach/exercises",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:null,expectedVersion:0,clientMutationId:randomUUID(),exercise:{name:"Draft Press",equipment:"",cue:{fr:"",en:""},defaultUnit:"lb",archived:false}})});
    expect(exerciseResponse.status).toBe(200);const exercise=(await exerciseResponse.json()).data.exercise;
    const trainingSession=newSession();const block=newBlock();block.exercises.push(addLibraryExercise(exercise));trainingSession.blocks.push(block);draft.weeks[0].sessions.push(trainingSession);
    const updated=await save({...command,id:first.id,expectedVersion:1,clientMutationId:randomUUID()});expect(updated.status).toBe(200);expect((await updated.json()).data.program.version).toBe(2);
    const read=await authenticatedFetch(environment,session,`${path}/${first.id}`);expect(read.status).toBe(200);expect((await read.json()).data.program.document).toEqual(draft);
    expect((await save({...command,id:first.id,expectedVersion:1,clientMutationId:randomUUID()})).status).toBe(409);
    expect((await authenticatedFetch(environment,clientSessionB,`${path}/${first.id}`)).status).toBe(403);
    expect((await authenticatedFetch(environment,session,`${path}/${randomUUID()}`)).status).toBe(404);
    const direct=await session.client.from("training_program_drafts").update({document:draft}).eq("id",first.id);expect(direct.error?.code).toBe("42501");
    const clientRead=await clientSessionB.client.from("training_program_drafts").select("id");expect(clientRead.error).toBeNull();expect(clientRead.data).toEqual([]);
    const malformed=structuredClone(draft) as unknown as {weeks:{sessions:{type:null}[]}[]};malformed.weeks[0].sessions[0].type=null;
    const invalid=await session.client.rpc("save_training_program_draft",{p_program_id:first.id,p_document:malformed,p_expected_version:2,p_idempotency_key:randomUUID()});expect(invalid.error?.message).toBe("FE_INVALID_TRAINING_DRAFT");
    const admin=createM1AdminClient(environment);
    const audits=await admin.from("audit_events").select("id").eq("entity_id",first.id);expect(audits.error).toBeNull();expect(audits.data).toHaveLength(2);
    const outbox=await admin.from("outbox_events").select("id").eq("aggregate_id",first.id);expect(outbox.error).toBeNull();expect(outbox.data).toHaveLength(0);
  });

  it("publishes an immutable program to the assigned Client through real HTTP", async () => {
    const own=await authenticatedFetch(environment,clientSessionB,"/api/v1/client/me");expect(own.status).toBe(200);
    const clientId=(await own.json()).client.clientId;
    const admin=createM1AdminClient(environment);
    const assignment=await admin.from("coach_client_assignments").insert({organization_id:coach.organizationId,client_id:clientId,coach_user_id:coach.userId,status:"ACTIVE",created_by:coach.userId});expect(assignment.error).toBeNull();
    const doc=newProgram();const rest=newSession();rest.type="complete-rest";doc.weeks[0].sessions.push(rest);
    const saved=await authenticatedFetch(environment,session,"/api/v1/coach/programs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:null,expectedVersion:0,clientMutationId:randomUUID(),document:doc})});expect(saved.status).toBe(200);
    const draft=(await saved.json()).data.program;
    const command={clientId,programId:draft.id,draftVersion:1,expectedPublicationId:null,clientMutationId:randomUUID()};
    const publish=(actor:M1SsrSession,body:unknown=command)=>authenticatedFetch(environment,actor,"/api/v1/coach/programs/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    expect((await publish(unverifiedCoachSession)).status).toBe(403);expect((await publish(clientSessionB)).status).toBe(403);
    expect((await fetch(`${environment.appUrl}/api/v1/client/program`)).status).toBe(401);
    const recipients=await authenticatedFetch(environment,session,"/api/v1/coach/programs/recipients");expect(recipients.status).toBe(200);expect((await recipients.json()).data.clients.some((c:{id:string})=>c.id===clientId)).toBe(true);
    const response=await publish(session);expect(response.status).toBe(200);const published=(await response.json()).data.program;
    const repeat=await publish(session);expect(repeat.status).toBe(200);expect((await repeat.json()).data.program).toEqual(published);
    const read=await authenticatedFetch(environment,clientSessionB,`/api/v1/client/program?clientId=${randomUUID()}`);expect(read.status).toBe(200);expect(read.headers.get("cache-control")).toContain("no-store");expect((await read.json()).data.program).toEqual(published);
    doc.title.fr="Private edit";
    const edited=await authenticatedFetch(environment,session,"/api/v1/coach/programs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:draft.id,expectedVersion:1,clientMutationId:randomUUID(),document:doc})});expect(edited.status).toBe(200);
    const preserved=await authenticatedFetch(environment,clientSessionB,"/api/v1/client/program");expect((await preserved.json()).data.program.document.title.fr).not.toBe("Private edit");
    expect((await publish(session,{...command,draftVersion:2,clientMutationId:randomUUID()})).status).toBe(409);
    const replaced=await publish(session,{...command,draftVersion:2,expectedPublicationId:published.id,clientMutationId:randomUUID()});expect(replaced.status).toBe(200);expect((await replaced.json()).data.program.revision).toBe(2);
    const latest=await authenticatedFetch(environment,clientSessionB,"/api/v1/client/program");expect((await latest.json()).data.program.document.title.fr).toBe("Private edit");
    const history=await clientSessionB.client.from("training_program_publications").select("id");expect(history.error).toBeNull();expect(history.data).toHaveLength(2);
    const tamper=await clientSessionB.client.from("training_program_publications").update({revision:99});expect(tamper.error?.code).toBe("42501");
  });

  it("persiste la bibliothèque Training sans élargir les accès Client ou Coach non vérifié", async () => {
    const path = "/api/v1/coach/exercises";
    const command = {
      id: null, expectedVersion: 0, clientMutationId: randomUUID(),
      exercise: { name: `Press ${randomUUID()}`, equipment: "Dumbbells",
        cue: { fr: "Contrôle", en: "Control" }, defaultUnit: "lb", archived: false },
    };
    for (const denied of [unverifiedCoachSession, clientSessionB]) {
      expect((await authenticatedFetch(environment, denied, path)).status).toBe(403);
      expect((await authenticatedFetch(environment, denied, path, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command),
      })).status).toBe(403);
    }
    expect((await fetch(`${environment.appUrl}${path}`)).status).toBe(401);
    async function save(body: unknown) {
      return authenticatedFetch(environment, session, path, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
    }
    const created = await save(command);
    expect(created.status).toBe(200);
    expect(created.headers.get("cache-control")).toContain("no-store");
    const first = (await created.json()).data.exercise;
    expect(first.version).toBe(1);
    expect(first.canEdit).toBe(true);
    const replay = await save(command);
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.exercise).toEqual(first);
    const listed = await authenticatedFetch(environment, session, `${path}?query=${encodeURIComponent(command.exercise.name)}`);
    expect(listed.status).toBe(200);
    expect((await listed.json()).data.items.map((item: { id: string }) => item.id)).toEqual([first.id]);
    const updated = await save({ ...command, id: first.id, expectedVersion: 1,
      clientMutationId: randomUUID(), exercise: { ...command.exercise, archived: true } });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.exercise.version).toBe(2);
    const stale = await save({ ...command, id: first.id, expectedVersion: 1, clientMutationId: randomUUID() });
    expect(stale.status).toBe(409);
    const hidden = await authenticatedFetch(environment, session, `${path}?query=${encodeURIComponent(command.exercise.name)}`);
    expect((await hidden.json()).data.items).toEqual([]);
    const archived = await authenticatedFetch(environment, session, `${path}?archived=true&query=${encodeURIComponent(command.exercise.name)}`);
    expect((await archived.json()).data.items).toHaveLength(1);
    const direct = await session.client.from("training_exercises").update({ name: "Unauthorized direct update" }).eq("id", first.id);
    expect(direct.error?.code).toBe("42501");
    const clientRead = await clientSessionB.client.from("training_exercises").select("id");
    expect(clientRead.error).toBeNull(); expect(clientRead.data).toEqual([]);
  });
});
