import "server-only";

import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";

import { hashInvitationToken } from "@/lib/auth/invitation-token";
import { getInvitationDeliveryEnvironment } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { OutboxEvent, OutboxHandler } from "@/lib/outbox/worker";

function invitationIdFrom(event: OutboxEvent) {
  const invitationId = event.payload.invitationId;
  if (typeof invitationId !== "string") throw new Error("Invitation event has no invitationId");
  return invitationId;
}

function deriveOpaqueToken(event: OutboxEvent, invitationId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`m1-invitation:${event.id}:${invitationId}`)
    .digest("base64url");
}

export const deliverClientInvitation: OutboxHandler = async (event) => {
  if (!['ClientInvitationCreated', 'ClientInvitationResent'].includes(event.event_type)) {
    throw new Error(`Unsupported invitation event ${event.event_type}`);
  }

  const environment = getInvitationDeliveryEnvironment();
  const admin = createAdminSupabaseClient();
  const invitationId = invitationIdFrom(event);
  const { data: invitation, error: invitationError } = await admin
    .from("client_invitations")
    .select("id, client_id, email, status, expires_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (invitationError || !invitation) throw invitationError ?? new Error("Invitation not found");

  // An accepted/revoked/expired invitation makes a delayed delivery a safe no-op.
  if (!["PENDING", "SENT"].includes(invitation.status)) return;
  if (Date.parse(invitation.expires_at) <= Date.now()) {
    const { error: expiryError } = await admin
      .from("client_invitations")
      .update({ status: "EXPIRED" })
      .eq("id", invitation.id)
      .in("status", ["PENDING", "SENT"]);
    if (expiryError) throw expiryError;
    return;
  }

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("first_name, locale")
    .eq("id", invitation.client_id)
    .single();
  if (clientError) throw clientError;

  const { error: authUserError } = await admin.auth.admin.createUser({
    email: invitation.email,
    email_confirm: true,
  });
  const authErrorCode = (authUserError as { code?: string } | null)?.code;
  const authUserAlreadyExists =
    ["email_exists", "user_already_exists"].includes(authErrorCode ?? "") ||
    /already (?:been )?registered|already exists/i.test(authUserError?.message ?? "");
  if (authUserError && !authUserAlreadyExists) {
    throw authUserError;
  }

  const { error: identityConflict } = await admin.rpc(
    "assert_m1_invitation_identity_safe",
    { p_invitation_id: invitation.id },
  );
  if (identityConflict) {
    throw new Error("Invitation identity is already assigned");
  }

  // The raw token is deterministic for this outbox event, exists only in this
  // worker invocation, and remains retry-safe with the provider idempotency key.
  const opaqueToken = deriveOpaqueToken(event, invitation.id, environment.INVITATION_TOKEN_SECRET);
  const tokenHash = hashInvitationToken(opaqueToken);
  const activationUrl = new URL("/activate", environment.NEXT_PUBLIC_APP_URL);
  // URL fragments are never sent in HTTP requests, so the bearer secret stays
  // out of reverse-proxy and access logs.
  activationUrl.hash = new URLSearchParams({ token: opaqueToken }).toString();
  const french = client.locale === "fr-CA";
  const subject = french ? "Ton accès Father Empowering" : "Your Father Empowering access";
  const text = french
    ? `Bonjour ${client.first_name},\n\nActive ton accès sécurisé : ${activationUrl.toString()}\n\nCe lien expire le ${invitation.expires_at}.`
    : `Hello ${client.first_name},\n\nActivate your secure access: ${activationUrl.toString()}\n\nThis link expires on ${invitation.expires_at}.`;

  if (environment.M1_EMAIL_TRANSPORT === "smtp") {
    const transport = nodemailer.createTransport({
      host: environment.M1_TEST_SMTP_HOST,
      port: environment.M1_TEST_SMTP_PORT,
      secure: false,
    });
    try {
      await transport.sendMail({
        from: environment.INVITATION_EMAIL_FROM,
        to: invitation.email,
        subject,
        text,
        headers: { "X-Father-Empowering-Event": event.id },
      });
    } finally {
      transport.close();
    }
  } else {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": event.id,
      },
      body: JSON.stringify({
        from: environment.INVITATION_EMAIL_FROM,
        to: [invitation.email],
        subject,
        text,
      }),
    });
    if (!response.ok) throw new Error(`Invitation provider failed with status ${response.status}`);
  }

  // SENT means the provider accepted the message. A failed provider call keeps
  // the invitation PENDING, so Coach status and activation never claim a
  // delivery that did not happen.
  const { data: delivered, error: deliveryError } = await admin
    .from("client_invitations")
    .update({ token_hash: tokenHash, status: "SENT", sent_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .in("status", ["PENDING", "SENT"])
    .select("id")
    .maybeSingle();
  if (deliveryError || !delivered) {
    throw deliveryError ?? new Error("Invitation is no longer deliverable");
  }
};

const acknowledgeM1Signal: OutboxHandler = async () => {
  // Realtime and post-activation email effects are deliberately deferred. The
  // transactional signal is still consumed so the M1 outbox remains healthy.
};

export const m1OutboxHandlers = {
  ClientInvitationCreated: deliverClientInvitation,
  ClientInvitationResent: deliverClientInvitation,
  ClientInvitationRevoked: acknowledgeM1Signal,
  ClientActivated: acknowledgeM1Signal,
} as const;
