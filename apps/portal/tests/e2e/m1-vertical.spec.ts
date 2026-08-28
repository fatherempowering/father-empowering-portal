import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import {
  M1SsrSession,
  createM1AdminClient,
  currentTotp,
  enrollAndVerifyTotp,
  getM1TestEnvironment,
  seedStaffIdentity,
  type SeededStaff,
} from "../harness/m1-local-supabase";
import {
  extractActivation,
  extractSixDigitOtp,
  waitForMail,
} from "../harness/mailpit";

const environment = getM1TestEnvironment();
const maxPassword = "M1-local-only-Max!123";
const clientEmail = `client.vertical.${randomUUID()}@example.test`;
let max: SeededStaff;
let maxTotpSecret: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  max = await seedStaffIdentity(environment, {
    email: `max.vertical.${randomUUID()}@example.test`,
    password: maxPassword,
    role: "COACH",
  });

  const enrollmentSession = new M1SsrSession(environment);
  const signIn = await enrollmentSession.client.auth.signInWithPassword({
    email: max.email,
    password: maxPassword,
  });
  if (signIn.error) throw signIn.error;
  maxTotpSecret = await enrollAndVerifyTotp(enrollmentSession);
  const signOut = await enrollmentSession.client.auth.signOut();
  if (signOut.error) throw signOut.error;
});

test("Max → création → invitation → OTP → activation → accès isolé", async ({ browser }) => {
  const maxContext = await browser.newContext();
  const maxPage = await maxContext.newPage();
  await loginMaxAtAal2(maxPage);

  await expect(maxPage.getByRole("heading", { name: /espace coach/i })).toBeVisible();
  await maxPage.getByRole("button", { name: /ajouter un client/i }).click();
  await maxPage.getByLabel(/prénom/i).fill("Client");
  await maxPage.getByLabel(/^nom$/i).fill("Vertical");
  await maxPage.getByLabel(/courriel du client/i).fill(clientEmail);
  await maxPage.getByRole("button", { name: /créer et inviter/i }).click();

  await expect(maxPage.getByText(/fiche de Client Vertical est créée/i)).toBeVisible();
  const invitedRow = maxPage.getByRole("listitem").filter({ hasText: clientEmail });
  await expect(invitedRow).toContainText(/invité/i);

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
  expect(JSON.stringify(storedInvitation.data)).not.toContain(activation.token);

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
    expect(JSON.stringify(result.data)).not.toContain(activation.token);
  }

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  const activationNavigationRequests: string[] = [];
  clientPage.on("request", (request) => {
    if (request.isNavigationRequest()) activationNavigationRequests.push(request.url());
  });
  await clientPage.goto(activation.url);
  await expect(clientPage.getByRole("heading", { name: /active ton portail/i })).toBeVisible();
  await expect(clientPage).toHaveURL(`${environment.appUrl}/activate`);
  expect(activationNavigationRequests.every((url) => !url.includes(activation.token))).toBe(true);
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
  await clientPage.getByLabel(/code à 6 chiffres/i).fill(otp);
  await clientPage.getByRole("button", { name: /activer mon portail/i }).click();

  await expect(clientPage).toHaveURL(/\/client(?:\?.*)?$/);
  await expect(clientPage.getByRole("heading", { name: /bienvenue, Client Vertical/i })).toBeVisible();
  await expect(clientPage.getByText(/^actif$/i).first()).toBeVisible();

  const ownProfile = await clientContext.request.get(`${environment.appUrl}/api/v1/client/me`);
  expect(ownProfile.status()).toBe(200);
  const ownProfileBody = await ownProfile.json();
  expect(ownProfileBody.client.id).toBe(storedInvitation.data?.client_id);
  expect(JSON.stringify(ownProfileBody)).not.toContain(max.userId);

  const forbiddenCoachApi = await clientContext.request.get(
    `${environment.appUrl}/api/v1/coach/clients`,
  );
  expect(forbiddenCoachApi.status()).toBe(403);
  await clientPage.goto(`${environment.appUrl}/coach`);
  await expect(clientPage.getByRole("heading", { name: /espace coach/i })).toHaveCount(0);

  await maxPage.goto(`${environment.appUrl}/coach`);
  const activeRow = maxPage.getByRole("listitem").filter({ hasText: clientEmail });
  await expect(activeRow).toContainText(/actif/i);

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
      "CoachMfaVerified",
      "CreateInvitedClient",
      "AcceptClientInvitation",
    ]),
  );

  await clientContext.close();
  await maxContext.close();
});

async function loginMaxAtAal2(page: Page): Promise<void> {
  await page.goto(`${environment.appUrl}/login`);
  await page.getByLabel(/courriel|email/i).fill(max.email);
  await page.getByLabel(/mot de passe|password/i).fill(maxPassword);
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();

  const factorInput = page.getByLabel(/code.*(6 chiffres|authentification|sécurité|totp|mfa)/i);
  await expect(factorInput).toBeVisible();
  const periodProgress = Date.now() % 30_000;
  if (periodProgress > 27_000) {
    await new Promise((resolve) => setTimeout(resolve, 30_250 - periodProgress));
  }
  await factorInput.fill(currentTotp(maxTotpSecret));
  await page.getByRole("button", { name: /vérifier|verify|continuer/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
}
