import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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

test("Staff se connecte une fois et alterne Coach ↔ son portail Client", async ({
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

  await page.getByRole("link", { name: /mon portail personnel/i }).click();
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
  const creationBody = (await creation.json()) as {
    data?: { clientId?: unknown; redirectTo?: unknown };
  };
  expect(creationBody.data?.redirectTo).toBe("/client");
  expect(typeof creationBody.data?.clientId).toBe("string");
  const ownClientId = creationBody.data!.clientId as string;

  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: /ton portail/i })).toBeVisible();
  await expectSessionCookies(context);
  await expect(page.getByRole("link", { name: /^espace coach$/i })).toHaveAttribute(
    "href",
    "/coach",
  );

  const ownApi = await context.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(ownApi.status()).toBe(200);
  expect(ownApi.headers()["cache-control"]).toContain("no-store");
  const ownApiText = await ownApi.text();
  expect(ownApiText).toContain(ownClientId);
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

  await page.getByRole("link", { name: /^espace coach$/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  await page.getByRole("link", { name: /mon portail personnel/i }).click();
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  expect(coachOtpRequests).toBe(otpRequestsAfterLogin);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/client(?:\?.*)?$/);
  await page.goto(`${environment.appUrl}/client/onboarding`);
  await expect(page.getByRole("heading", { name: /questionnaire d’accueil/i })).toBeVisible();
  await page.goto(`${environment.appUrl}/client/week-zero`);
  await expect(page.getByRole("heading", { name: /bilan initial/i })).toBeVisible();
  expect(coachOtpRequests).toBe(otpRequestsAfterLogin);

  await page.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
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
  await expect(page.getByRole("heading", { name: /ton portail/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^espace coach$/i })).toHaveCount(0);
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
      first_name: "Normal",
      last_name: "Client",
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
