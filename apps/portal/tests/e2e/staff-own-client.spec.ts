import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page, type Response as BrowserResponse } from "@playwright/test";

import { EMPTY_INITIAL_ASSESSMENT_RESPONSES } from "@/lib/contracts/week-zero";
import {
  createM1AdminClient,
  getM1TestEnvironment,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();
const staffPassword = "M1-local-only-Personal-E2E!123";
const normalClientPassword = "M1-local-only-Normal-Client!123";
const usedMailIds = new Set<string>();

type SeededClient = Readonly<{
  clientId: string;
  email: string;
}>;

let owner: SeededStaff;
let normalClient: SeededClient;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  owner = await seedStaffIdentity(environment, {
    email: `staff-own.e2e.${randomUUID()}@example.test`,
    password: staffPassword,
    role: "COACH",
  });
  normalClient = await seedNormalClient(owner);
});

test("Les profils personnels existants restent isolés sans raccourci Client dans la navigation Coach", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let coachOtpRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/auth/coach-email-otp/request") {
      coachOtpRequests += 1;
    }
  });

  await signInCoach(page, owner.email, staffPassword);
  await verifyCoachEmail(page, owner.email);
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  await expectSessionCookies(context);
  const otpRequestsAfterLogin = coachOtpRequests;
  expect(otpRequestsAfterLogin).toBeGreaterThan(0);

  await expect(page.getByRole("link", { name: /mon portail personnel/i })).toHaveCount(0);
  // Compatibility and isolation are still tested; this legacy entry is no
  // longer offered in the Coach navigation. Existing identities are retained.
  await page.goto(`${environment.appUrl}/coach/personal`);
  await expect(page).toHaveURL(/\/coach\/personal$/);
  await expect(
    page.getByRole("heading", { name: /portail personnel/i }),
  ).toBeVisible();
  await page.getByLabel(/^prénom$/i).fill("Max");
  await page.getByLabel(/^nom$/i).fill("Personnel");

  const creationResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === environment.appUrl &&
      url.pathname === "/api/v1/coach/personal-client"
    );
  });
  await page
    .getByRole("button", { name: /activer mon portail personnel/i })
    .click();
  const creation = await creationResponse;
  expect(creation.status()).toBe(201);

  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Ton parcours commence ici." })).toBeVisible();
  await expectSessionCookies(context);
  await expect(page.getByRole("link", { name: /^portail coach$/i })).toHaveAttribute(
    "href",
    "/coach",
  );

  const ownApi = await context.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(ownApi.status()).toBe(200);
  expect(ownApi.headers()["cache-control"]).toContain("no-store");
  const ownApiBody = (await ownApi.json()) as {
    client?: { clientId?: unknown };
  };
  expect(typeof ownApiBody.client?.clientId).toBe("string");
  const ownClientId = ownApiBody.client!.clientId as string;
  expect(ownClientId).not.toBe(normalClient.clientId);
  const ownApiText = JSON.stringify(ownApiBody);
  expect(ownApiText).not.toContain(normalClient.clientId);

  const onboardingInitial = await context.request.get(
    `${environment.appUrl}/api/v1/client/onboarding`,
  );
  expect(onboardingInitial.status()).toBe(200);
  const onboardingInitialBody = (await onboardingInitial.json()) as {
    data?: {
      intake?: {
        status?: unknown;
        version?: unknown;
        responses?: Record<string, unknown>;
      };
    };
  };
  expect(onboardingInitialBody.data?.intake).toMatchObject({
    status: "NOT_STARTED",
    version: 0,
    responses: { fullName: "Max Personnel", email: owner.email },
  });
  const onboardingSave = await context.request.put(
    `${environment.appUrl}/api/v1/client/onboarding`,
    {
      headers: { origin: environment.appUrl },
      data: {
        expectedVersion: 0,
        clientMutationId: randomUUID(),
        responses: onboardingInitialBody.data!.intake!.responses,
      },
    },
  );
  expect(onboardingSave.status()).toBe(200);

  const assessmentSave = await context.request.put(
    `${environment.appUrl}/api/v1/client/week-zero`,
    {
      headers: { origin: environment.appUrl },
      data: {
        expectedVersion: 0,
        clientMutationId: randomUUID(),
        responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
      },
    },
  );
  expect(assessmentSave.status()).toBe(200);

  const onboarding = await context.request.get(
    `${environment.appUrl}/api/v1/client/onboarding?clientId=${normalClient.clientId}`,
  );
  const assessment = await context.request.get(
    `${environment.appUrl}/api/v1/client/week-zero?clientId=${normalClient.clientId}`,
  );
  expect(onboarding.status()).toBe(200);
  expect(assessment.status()).toBe(200);
  const onboardingBody = (await onboarding.json()) as {
    data?: { intake?: { status?: unknown; version?: unknown; responses?: unknown } };
  };
  const assessmentBody = (await assessment.json()) as {
    data?: { assessment?: { status?: unknown; version?: unknown } };
  };
  expect(onboardingBody.data?.intake).toMatchObject({
    status: "DRAFT",
    version: 1,
    responses: { fullName: "Max Personnel", email: owner.email },
  });
  expect(assessmentBody.data?.assessment).toMatchObject({
    status: "DRAFT",
    version: 1,
  });
  const ownResponses = JSON.stringify({ onboardingBody, assessmentBody });
  expect(ownResponses).not.toContain(normalClient.email);
  expect(ownResponses).not.toContain(normalClient.clientId);

  await page.getByRole("link", { name: /^portail coach$/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /mon portail personnel/i })).toHaveCount(0);
  await page.goto(`${environment.appUrl}/client`);
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  expect(coachOtpRequests).toBe(otpRequestsAfterLogin);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await page.goto(`${environment.appUrl}/client/onboarding`);
  await expect(page.getByRole("heading", { name: "Faisons connaissance." })).toBeVisible();
  await page.goto(`${environment.appUrl}/client/week-zero`);
  await expect(page.getByRole("heading", { name: /semaine zéro/i })).toBeVisible();
  expect(coachOtpRequests).toBe(otpRequestsAfterLogin);

  // Explicit local fixture assignment, not a permission change or automatic
  // side effect of personal profile creation. Both records deliberately share a name.
  const fixture = createM1AdminClient(environment);
  const assignments = await fixture.from("coach_client_assignments").insert(
    [ownClientId, normalClient.clientId].map(clientId => ({
      organization_id:owner.organizationId,coach_user_id:owner.userId,client_id:clientId,
      status:"ACTIVE",is_primary:true,created_by:owner.userId,
    })),
  );
  expect(assignments.error).toBeNull();
  await page.goto(`${environment.appUrl}/coach`);
  for (let attempt=0;attempt<2;attempt++) {
    await expect(page.getByText("Max Personnel — Mon profil personnel",{exact:true})).toBeVisible();
    await expect(page.getByText("Max Personnel",{exact:true})).toBeVisible();
    const recipients = await context.request.get(`${environment.appUrl}/api/v1/coach/programs/recipients?page=0`);
    expect(recipients.status()).toBe(200);
    const recipientBody = await recipients.json() as {data:{clients:Array<{id:string;name:string;isOwnProfile:boolean}>}};
    expect(recipientBody.data.clients).toEqual(expect.arrayContaining([
      {id:ownClientId,name:"Max Personnel",isOwnProfile:true},
      {id:normalClient.clientId,name:"Max Personnel",isOwnProfile:false},
    ]));
    expect(recipientBody.data.clients).toHaveLength(2);
    if(attempt===0) await page.reload();
  }
  expect(coachOtpRequests).toBe(otpRequestsAfterLogin);
  await expect(page.getByRole("link",{name:/mon portail personnel/i})).toHaveCount(0);
  await page.goto(`${environment.appUrl}/client`);
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);

  // Keep concurrent reads running: waiting for them here could hide a logout race.
  // Only fixed local paths, HTTP statuses and allowlisted destinations are recorded.
  const logoutReads = new Set(["/api/v1/client/me", "/api/v1/client/program", "/api/v1/client/onboarding"]);
  const logoutDiagnostic: {
    status: number | null;
    redirectTo: "/login" | "/client-login" | "ABSENT" | "OTHER" | "UNREADABLE" | "NO_RESPONSE";
    reads: Array<{ path: string; status: number }>;
  } = { status: null, redirectTo: "NO_RESPONSE", reads: [] };
  const observeRead = (response: BrowserResponse) => {
    const url = new URL(response.url());
    if (url.origin === environment.appUrl && logoutReads.has(url.pathname) && logoutDiagnostic.reads.length < 12) {
      logoutDiagnostic.reads.push({ path: url.pathname, status: response.status() });
    }
  };
  page.on("response", observeRead);
  const observeLogout = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === environment.appUrl && url.pathname === "/api/v1/auth/client-logout" && response.request().method() === "POST";
  }, { timeout: 10_000 }).then(async response => {
    logoutDiagnostic.status = response.status();
    try {
      const payload = await response.json();
      const destination: unknown = payload?.data?.redirectTo;
      logoutDiagnostic.redirectTo = destination === "/login" || destination === "/client-login" ? destination : destination == null ? "ABSENT" : "OTHER";
    } catch { logoutDiagnostic.redirectTo = "UNREADABLE"; }
  }).catch(() => { /* NO_RESPONSE is deliberately independent of the raw error. */ });
  try {
    await page.getByRole("button", { name: /se déconnecter/i }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  } finally {
    page.off("response", observeRead);
    await observeLogout;
    console.info("M1 logout diagnostic", JSON.stringify(logoutDiagnostic));
  }
  const signedOutClient = await context.request.get(
    `${environment.appUrl}/api/v1/client/me`,
  );
  const signedOutCoach = await context.request.get(
    `${environment.appUrl}/api/v1/coach/clients`,
  );
  expect(signedOutClient.status()).toBe(401);
  expect(signedOutCoach.status()).toBe(401);
  await page.goto(`${environment.appUrl}/coach`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.goto(`${environment.appUrl}/client`);
  await expect(page).toHaveURL(/\/(?:client-login|login)(?:\?.*)?$/);
  await context.close();
});

test("le Client normal garde son OTP et ne reçoit aucun switch Staff", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${environment.appUrl}/client-login`);
  await page.getByLabel(/^courriel$/i).fill(normalClient.email);
  await page.getByRole("button", { name: /envoyer mon code/i }).click();
  await expect(page.getByText(/si ce compte est actif/i)).toBeVisible();

  const otpMail = await waitForMail(
    environment.mailpitUrl,
    normalClient.email,
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
  const codeInput = page.getByRole("textbox", { name: /chiffre 1 sur 6/i });
  await codeInput.fill(extractSixDigitOtp(otpMail));
  await page.getByRole("button", { name: /ouvrir mon portail/i }).click();
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Ton parcours commence ici." })).toBeVisible();
  await expect(page.getByRole("link", { name: /^portail coach$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /mon portail personnel/i })).toHaveCount(0);

  const own = await context.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(own.status()).toBe(200);
  const ownText = await own.text();
  expect(ownText).toContain(normalClient.clientId);
  expect(ownText).not.toContain(owner.userId);

  await page.goto(`${environment.appUrl}/coach`);
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await page.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(page).toHaveURL(/\/client-login(?:\?.*)?$/);
  await context.close();
});

async function seedNormalClient(staff: SeededStaff): Promise<SeededClient> {
  const admin = createM1AdminClient(environment);
  const email = `staff-own.normal-client.${randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: normalClientPassword,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error("Unable to seed normal Client E2E identity");
  }
  const clientId = randomUUID();
  const writes = await Promise.all([
    admin.from("profiles").insert({
      auth_user_id: created.data.user.id,
      display_name: "Normal Client E2E",
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: staff.userId,
    }),
    admin.from("organization_memberships").insert({
      organization_id: staff.organizationId,
      user_id: created.data.user.id,
      role: "CLIENT",
      status: "ACTIVE",
      activated_at: new Date().toISOString(),
      created_by: staff.userId,
    }),
    admin.from("clients").insert({
      id: clientId,
      organization_id: staff.organizationId,
      auth_user_id: created.data.user.id,
      email,
      first_name: "Max",
      last_name: "Personnel",
      locale: "fr-CA",
      time_zone: "America/Montreal",
      status: "ACTIVE",
      created_by: staff.userId,
    }),
  ]);
  for (const write of writes) {
    if (write.error) throw write.error;
  }
  return { clientId, email };
}

async function signInCoach(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${environment.appUrl}/login`);
  await page.getByLabel(/courriel|email/i).fill(email);
  await page.getByLabel(/^mot de passe$/i).fill(password);
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
}

async function verifyCoachEmail(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
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
    { excludeIds: usedMailIds },
  );
  usedMailIds.add(mail.id);
  await page
    .getByRole("textbox", { name: /chiffre 1 sur 6/i })
    .fill(extractSixDigitOtp(mail));
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
}

async function expectSessionCookies(context: BrowserContext): Promise<void> {
  expect(
    (await context.cookies()).some((cookie) => cookie.name.startsWith("sb-")),
  ).toBe(true);
}
