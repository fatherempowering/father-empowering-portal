import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import {
  M1SsrSession,
  createM1AdminClient,
  getM1TestEnvironment,
  seedPasswordlessStaffIdentity,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";
import {
  extractActivation,
  extractPasswordRecoveryUrl,
  extractSixDigitOtp,
  waitForMail,
} from "../harness/mailpit";

const environment = getM1TestEnvironment();
const maxPassword = "M1-local-only-Max!123";
const recoveredMaxPassword = "M1-local-only-Max-recovered!456";
const clientEmail = `client.vertical.${randomUUID()}@example.test`;
const usedCoachEmailIds = new Set<string>();
let max: SeededStaff;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  max = await seedStaffIdentity(environment, {
    email: `max.vertical.${randomUUID()}@example.test`,
    password: maxPassword,
    role: "COACH",
  });
});

test("Admin sans mot de passe → récupération → code courriel → reconnexion", async ({
  browser,
}) => {
  const email = `owner.vertical.${randomUUID()}@example.test`;
  const password = "M1-local-only-Owner!789";
  await seedPasswordlessStaffIdentity(environment, { email, role: "ADMIN" });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${environment.appUrl}/forgot-password`);
  await page.getByLabel(/^courriel$/i).fill(email);
  await page.getByRole("button", { name: /envoyer le lien sécurisé/i }).click();
  await expect(page.getByText(/si ce compte est autorisé/i)).toBeVisible();

  const recoveryMail = await waitForMail(
    environment.mailpitUrl,
    email,
    (message) => {
      try {
        extractPasswordRecoveryUrl(message);
        return true;
      } catch {
        return false;
      }
    },
  );
  usedCoachEmailIds.add(recoveryMail.id);
  await page.goto(extractPasswordRecoveryUrl(recoveryMail));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel(/^nouveau mot de passe$/i).fill(password);
  await page.getByLabel(/^confirmer le mot de passe$/i).fill(password);
  await page.getByRole("button", { name: /enregistrer mon mot de passe/i }).click();
  await expect(page).toHaveURL(/\/login\?password=updated$/);

  await signInCoach(page, email, password);
  await verifyCoachEmailCode(page, email);
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);

  await page.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.goto(`${environment.appUrl}/coach`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  await signInCoach(page, email, password);
  await verifyCoachEmailCode(page, email);
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  await context.close();
});

test("Max → création → invitation → OTP → activation → accès isolé", async ({ browser }) => {
  const staffSessionA = new M1SsrSession(environment);
  const staffSessionB = new M1SsrSession(environment);
  const staffSignInA = await staffSessionA.client.auth.signInWithPassword({
    email: max.email,
    password: maxPassword,
  });
  const staffSignInB = await staffSessionB.client.auth.signInWithPassword({
    email: max.email,
    password: maxPassword,
  });
  expect(staffSignInA.error).toBeNull();
  expect(staffSignInB.error).toBeNull();
  const staffRefreshTokenA = staffSignInA.data.session?.refresh_token;
  const staffRefreshTokenB = staffSignInB.data.session?.refresh_token;
  expect(staffRefreshTokenA).toBeTruthy();
  expect(staffRefreshTokenB).toBeTruthy();

  const maxContext = await browser.newContext();
  const maxPage = await maxContext.newPage();

  await maxPage.goto(`${environment.appUrl}/forgot-password`);
  await maxPage.getByLabel(/^courriel$/i).fill(max.email);
  await maxPage.getByRole("button", { name: /envoyer le lien sécurisé/i }).click();
  await expect(maxPage.getByText(/si ce compte est autorisé/i)).toBeVisible();
  const recoveryMail = await waitForMail(
    environment.mailpitUrl,
    max.email,
    (message) => {
      try {
        extractPasswordRecoveryUrl(message);
        return true;
      } catch {
        return false;
      }
    },
  );
  usedCoachEmailIds.add(recoveryMail.id);
  await maxPage.goto(extractPasswordRecoveryUrl(recoveryMail));
  await expect(maxPage).toHaveURL(/\/reset-password$/);
  await maxPage.getByLabel(/^nouveau mot de passe$/i).fill(recoveredMaxPassword);
  await maxPage.getByLabel(/^confirmer le mot de passe$/i).fill(recoveredMaxPassword);
  const passwordUpdateResponse = maxPage.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === environment.appUrl &&
      url.pathname === "/api/v1/auth/coach-password/update"
    );
  });
  await maxPage.getByRole("button", { name: /enregistrer mon mot de passe/i }).click();
  const passwordUpdate = await passwordUpdateResponse;
  if (!passwordUpdate.ok()) {
    const diagnostic = await safePasswordUpdateDiagnostic(passwordUpdate);
    throw new Error(
      `Staff password update failed: status=${passwordUpdate.status()} ` +
        `error.code=${diagnostic.code} error.message=${diagnostic.message}`,
    );
  }
  await expect(maxPage).toHaveURL(/\/login\?password=updated$/);

  for (const [session, refreshToken] of [
    [staffSessionA, staffRefreshTokenA],
    [staffSessionB, staffRefreshTokenB],
  ] as const) {
    const refresh = await session.client.auth.refreshSession({
      refresh_token: refreshToken!,
    });
    expect(refresh.data.session).toBeNull();
    expect(refresh.error).not.toBeNull();
  }

  await loginMaxWithEmailVerification(maxPage, recoveredMaxPassword);

  await expect(maxPage.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  await maxPage.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(maxPage).toHaveURL(/\/login(?:\?.*)?$/);
  const signedOutCoachApi = await maxContext.request.get(
    `${environment.appUrl}/api/v1/coach/clients`,
  );
  expect(signedOutCoachApi.status()).toBe(401);
  await maxPage.goto(`${environment.appUrl}/coach`);
  await expect(maxPage).toHaveURL(/\/login(?:\?.*)?$/);

  await loginMaxWithEmailVerification(maxPage, recoveredMaxPassword);
  await expect(maxPage.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  await maxPage.getByRole("button", { name: /ajouter un client/i }).click();
  await maxPage.getByLabel(/prénom/i).fill("Client");
  await maxPage.getByLabel(/^nom$/i).fill("Vertical");
  await maxPage.getByLabel(/courriel du client/i).fill(clientEmail);
  await maxPage.getByRole("button", { name: /créer et inviter/i }).click();

  await expect(maxPage.getByText(/fiche de Client Vertical est créée/i)).toBeVisible();
  const invitedRow = maxPage.getByRole("listitem").filter({ hasText: clientEmail });
  await expect(invitedRow).toContainText(/activation en attente/i);

  const invitationMail = await waitForMail(
    environment.mailpitUrl,
    clientEmail,
    (message) => /\/activate#token=/.test(`${message.text}\n${message.html}`),
  );
  const activation = extractActivation(environment.appUrl, invitationMail);
  expect(new URL(activation.url).search).toBe("");

  const admin = createM1AdminClient(environment);
  const storedInvitation = await admin
    .from("client_invitations")
    .select("id, client_id, token_hash")
    .eq("organization_id", max.organizationId)
    .eq("email", clientEmail)
    .single();
  expect(storedInvitation.error).toBeNull();
  expect(storedInvitation.data?.token_hash).toBe(
    createHash("sha256").update(activation.token).digest("hex"),
  );
  assertSecretAbsent(JSON.stringify(storedInvitation.data), activation.token, "invitation row");

  const sensitivePersistence = await Promise.all([
    admin
      .from("audit_events")
      .select("context")
      .eq("organization_id", max.organizationId),
    admin
      .from("outbox_events")
      .select("payload")
      .eq("organization_id", max.organizationId),
  ]);
  for (const result of sensitivePersistence) {
    expect(result.error).toBeNull();
    assertSecretAbsent(JSON.stringify(result.data), activation.token, "persisted side effect");
  }

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.setViewportSize({ width: 390, height: 844 });
  const activationNavigationRequests: string[] = [];
  const activationInspectionResponse = clientPage.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === environment.appUrl &&
      url.pathname === "/api/v1/client/activation"
    );
  });
  clientPage.on("request", (request) => {
    if (request.isNavigationRequest()) activationNavigationRequests.push(request.url());
  });
  try {
    await clientPage.setContent(invitationMail.html);
    const activationLink = clientPage.getByRole("link", {
      name: /activer mon portail|activate my portal/i,
    });
    await expect(activationLink).toHaveAttribute("href", activation.url);
    await activationLink.click();
  } catch {
    throw new Error("Invitation email link failed before the bearer fragment was erased.");
  }
  await expect(clientPage.getByRole("heading", { name: /active ton portail/i })).toBeVisible();
  await expect(clientPage).toHaveURL(`${environment.appUrl}/activate`);
  expect(activationNavigationRequests.every((url) => !url.includes(activation.token))).toBe(true);
  const inspectionResponse = await activationInspectionResponse;
  if (!inspectionResponse.ok()) {
    const diagnostic = await safeActivationDiagnostic(inspectionResponse);
    throw new Error(
      `Initial activation inspection failed: status=${inspectionResponse.status()} ` +
        `error.code=${diagnostic.code} error.message=${diagnostic.message}`,
    );
  }
  await clientPage.getByRole("button", { name: /envoyer mon code/i }).click();
  await expect(clientPage.getByText(/code envoyé/i)).toBeVisible();

  const otpMail = await waitForMail(
    environment.mailpitUrl,
    clientEmail,
    (message) => {
      try {
        extractSixDigitOtp(message);
        return true;
      } catch {
        return false;
      }
    },
    { excludeIds: new Set([invitationMail.id]) },
  );
  const otp = extractSixDigitOtp(otpMail);
  try {
    await clientPage.getByRole("textbox", { name: /chiffre 1 sur 6/i }).fill(otp);
  } catch {
    throw new Error("Unable to enter the captured OTP.");
  }
  await clientPage.getByRole("button", { name: /activer mon portail/i }).click();

  await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(clientPage.getByRole("heading", { name: /bienvenue, Client Vertical/i })).toBeVisible();
  await expect(clientPage.getByText(/^portail activé$/i).first()).toBeVisible();
  await expect(clientPage.getByRole("link", { name: "Accueil" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await clientPage.getByRole("link", { name: "Voir aujourd’hui" }).click();
  await expect(clientPage).toHaveURL(/\/client\/today(?:\?.*)?$/);
  await expect(clientPage.getByRole("heading", { name: "Aujourd’hui" })).toBeVisible();
  await expect(
    clientPage.getByRole("heading", { name: "Tu es à jour." }),
  ).toBeVisible();
  await expect(clientPage.getByText(/rien à faire pour le moment/i)).toBeVisible();
  await expect(clientPage.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await clientPage.getByRole("link", { name: "Accueil" }).click();
  await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);

  const ownProfile = await clientContext.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(ownProfile.status()).toBe(200);
  const ownProfileBody = await ownProfile.json();
  expect(ownProfileBody.client.clientId).toBe(storedInvitation.data?.client_id);
  expect(JSON.stringify(ownProfileBody)).not.toContain(max.userId);

  const forbiddenCoachApi = await clientContext.request.get(
    `${environment.appUrl}/api/v1/coach/clients`,
  );
  expect(forbiddenCoachApi.status()).toBe(403);
  await clientPage.goto(`${environment.appUrl}/coach`);
  await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(clientPage.getByRole("heading", { name: /^clients$/i })).toHaveCount(0);

  await clientPage.close();
  const continuedPage = await clientContext.newPage();
  const continuedOtpRequests: string[] = [];
  continuedPage.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.origin === environment.appUrl &&
      url.pathname === "/api/v1/auth/client-otp/request"
    ) {
      continuedOtpRequests.push(request.url());
    }
  });

  await continuedPage.goto(`${environment.appUrl}/client`);
  await expect(
    continuedPage.getByRole("heading", { name: /bienvenue, Client Vertical/i }),
  ).toBeVisible();
  await continuedPage.goto(`${environment.appUrl}/client-login`);
  await expect(continuedPage).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(
    continuedPage.getByRole("heading", { name: /bienvenue, Client Vertical/i }),
  ).toBeVisible();
  expect(continuedOtpRequests).toHaveLength(0);

  await continuedPage.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(continuedPage).toHaveURL(/\/client-login(?:\?.*)?$/);
  await expect(continuedPage.getByLabel(/^courriel$/i)).toBeVisible();
  const signedOutProfile = await clientContext.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(signedOutProfile.status()).toBe(401);
  await continuedPage.goto(`${environment.appUrl}/client`);
  await expect(continuedPage).toHaveURL(/\/client-login(?:\?.*)?$/);

  const returningContext = await browser.newContext();
  const returningPage = await returningContext.newPage();
  await returningPage.goto(`${environment.appUrl}/client-login`);
  await expect(returningPage.getByLabel(/^courriel$/i)).toBeVisible();
  await returningPage.getByLabel(/^courriel$/i).fill(clientEmail);
  await returningPage.getByRole("button", { name: /envoyer mon code/i }).click();
  await expect(returningPage.getByText(/si ce compte est actif/i)).toBeVisible();
  const returningOtpMail = await waitForMail(
    environment.mailpitUrl,
    clientEmail,
    (message) => {
      try {
        extractSixDigitOtp(message);
        return true;
      } catch {
        return false;
      }
    },
    { excludeIds: new Set([invitationMail.id, otpMail.id]) },
  );
  try {
    await returningPage
      .getByRole("textbox", { name: /chiffre 1 sur 6/i })
      .fill(extractSixDigitOtp(returningOtpMail));
  } catch {
    throw new Error("Unable to enter the returning-client OTP.");
  }
  await returningPage.getByRole("button", { name: /ouvrir mon portail/i }).click();
  await expect(returningPage).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(
    returningPage.getByRole("heading", { name: /bienvenue, Client Vertical/i }),
  ).toBeVisible();
  const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  expect(authUsers.error).toBeNull();
  expect(authUsers.data.users.filter((user) => user.email === clientEmail)).toHaveLength(1);

  const clientRecoveryContext = await browser.newContext();
  const clientRecoveryPage = await clientRecoveryContext.newPage();
  await clientRecoveryPage.goto(`${environment.appUrl}/forgot-password`);
  await clientRecoveryPage.getByLabel(/^courriel$/i).fill(clientEmail);
  await clientRecoveryPage
    .getByRole("button", { name: /envoyer le lien sécurisé/i })
    .click();
  await expect(
    clientRecoveryPage.getByText(/si ce compte est autorisé/i),
  ).toBeVisible();
  const clientRecoveryMail = await waitForMail(
    environment.mailpitUrl,
    clientEmail,
    (message) => {
      try {
        extractPasswordRecoveryUrl(message);
        return true;
      } catch {
        return false;
      }
    },
    {
      excludeIds: new Set([
        invitationMail.id,
        otpMail.id,
        returningOtpMail.id,
      ]),
    },
  );
  await clientRecoveryPage.goto(extractPasswordRecoveryUrl(clientRecoveryMail));
  await expect(clientRecoveryPage).toHaveURL(/\/login\?error=recovery$/);
  await expect(
    clientRecoveryPage.getByRole("heading", { name: /choisis ton mot de passe/i }),
  ).toHaveCount(0);
  expect(
    (await clientRecoveryContext.cookies()).some(
      (cookie) => cookie.name === "fe-staff-recovery",
    ),
  ).toBe(false);

  const activeRow = maxPage.getByRole("listitem").filter({ hasText: clientEmail });
  await expect(activeRow).toContainText(/actif/i, { timeout: 20_000 });

  const persistedState = await Promise.all([
    admin
      .from("clients")
      .select("id, auth_user_id, status")
      .eq("id", storedInvitation.data?.client_id)
      .single(),
    admin
      .from("coach_client_assignments")
      .select("coach_user_id, status, is_primary")
      .eq("client_id", storedInvitation.data?.client_id)
      .single(),
    admin
      .from("organization_memberships")
      .select("user_id, role, status")
      .eq("organization_id", max.organizationId)
      .eq("role", "CLIENT")
      .single(),
    admin
      .from("client_invitations")
      .select("accepted_by, status")
      .eq("id", storedInvitation.data?.id)
      .single(),
  ]);
  for (const result of persistedState) expect(result.error).toBeNull();
  expect(persistedState[0].data?.status).toBe("ACTIVE");
  expect(persistedState[1].data).toMatchObject({
    coach_user_id: max.userId,
    status: "ACTIVE",
    is_primary: true,
  });
  expect(persistedState[2].data).toMatchObject({ role: "CLIENT", status: "ACTIVE" });
  expect(persistedState[3].data).toMatchObject({ status: "ACCEPTED" });
  expect(persistedState[0].data?.auth_user_id).toBe(persistedState[2].data?.user_id);
  expect(persistedState[3].data?.accepted_by).toBe(persistedState[2].data?.user_id);

  const audits = await admin
    .from("audit_events")
    .select("command, actor_user_id")
    .eq("organization_id", max.organizationId);
  expect(audits.error).toBeNull();
  expect(audits.data?.map((audit) => audit.command)).toEqual(
    expect.arrayContaining([
      "CoachSignedIn",
      "CoachEmailVerified",
      "CreateInvitedClient",
      "AcceptClientInvitation",
      "ClientSignedIn",
    ]),
  );

  await returningContext.close();
  await clientRecoveryContext.close();
  await clientContext.close();
  await maxContext.close();
});

async function safeActivationDiagnostic(response: {
  json(): Promise<unknown>;
}): Promise<{ code: string; message: string }> {
  const allowedCodes = new Set([
    "FORBIDDEN",
    "INVITATION_UNAVAILABLE",
    "RATE_LIMITED",
    "TEMPORARILY_UNAVAILABLE",
    "VALIDATION_FAILED",
  ]);
  const allowedMessages = new Set([
    "Cross-origin mutation denied",
    "Request denied.",
    "Please try again.",
    "The invitation is invalid, expired, or has already been used.",
    "Invitation lookup failed",
    "Client lookup failed",
    "Invalid JSON request",
    "A JSON object is required",
    "Request body is too large",
    "Unable to read request body",
    "Invalid UTF-8 request",
  ]);
  const payload = await response.json().catch(() => null);
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload.error as unknown)
      : null;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error.code as unknown)
      : null;
  const message =
    error && typeof error === "object" && "message" in error
      ? (error.message as unknown)
      : null;

  return {
    code: typeof code === "string" && allowedCodes.has(code) ? code : "REDACTED_OR_ABSENT",
    message:
      typeof message === "string" && allowedMessages.has(message)
        ? message
        : "REDACTED_OR_ABSENT",
  };
}

async function safePasswordUpdateDiagnostic(response: {
  json(): Promise<unknown>;
}): Promise<{ code: string; message: string }> {
  const allowedCodes = new Set([
    "FORBIDDEN",
    "UNAUTHENTICATED",
    "TEMPORARILY_UNAVAILABLE",
    "VALIDATION_FAILED",
  ]);
  const allowedMessages = new Set([
    "Cross-origin mutation denied",
    "Authentication required",
    "Password recovery authorization is invalid or expired",
    "Staff access required",
    "Unable to update password",
    "Unable to close recovery sessions",
    "Invalid request.",
    "Service temporarily unavailable.",
  ]);
  const payload = await response.json().catch(() => null);
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload.error as unknown)
      : null;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error.code as unknown)
      : null;
  const message =
    error && typeof error === "object" && "message" in error
      ? (error.message as unknown)
      : null;
  return {
    code: typeof code === "string" && allowedCodes.has(code) ? code : "REDACTED_OR_ABSENT",
    message:
      typeof message === "string" && allowedMessages.has(message)
        ? message
        : "REDACTED_OR_ABSENT",
  };
}

async function loginMaxWithEmailVerification(
  page: Page,
  password = maxPassword,
): Promise<void> {
  await signInCoach(page, max.email, password);
  await verifyCoachEmailCode(page, max.email);
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
}

async function signInCoach(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${environment.appUrl}/login`);
  await page.getByLabel(/courriel|email/i).fill(email);
  await page.getByLabel(/^mot de passe$/i).fill(password);
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
}

async function verifyCoachEmailCode(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
  await expect(
    page.getByText(/envoyons automatiquement un code à 6 chiffres|code reçu par courriel/i),
  ).toBeVisible();
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
    { excludeIds: usedCoachEmailIds },
  );
  usedCoachEmailIds.add(mail.id);
  const factorInput = page.getByRole("textbox", { name: /chiffre 1 sur 6/i });
  await expect(factorInput).toBeVisible();
  try {
    await factorInput.fill(extractSixDigitOtp(mail));
  } catch {
    throw new Error("Unable to enter the captured Coach email code.");
  }
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
}

function assertSecretAbsent(serialized: string, secret: string, location: string): void {
  if (serialized.includes(secret)) {
    throw new Error(`Raw invitation secret was persisted in ${location}.`);
  }
}
