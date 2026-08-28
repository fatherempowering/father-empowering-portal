import "server-only";

import { createHmac } from "node:crypto";

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
  if (!['PENDING', 'SENT'].includes(invitation.status)) return;

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

  // The raw token is deterministic for this outbox event, exists only in this
  // worker invocation, and remains retry-safe with the provider idempotency key.
  const opaqueToken = deriveOpaqueToken(event, invitation.id, environment.INVITATION_TOKEN_SECRET);
  const tokenHash = hashInvitationToken(opaqueToken);
  const sentAt = new Date().toISOString();
  const { data: rotated, error: rotationError } = await admin
    .from("client_invitations")
    .update({ token_hash: tokenHash, status: "SENT", sent_at: sentAt })
    .eq("id", invitation.id)
    .in("status", ["PENDING", "SENT"])
    .select("id")
    .maybeSingle();
  if (rotationError || !rotated) throw rotationError ?? new Error("Invitation is no longer deliverable");

  const activationUrl = new URL("/activate", environment.NEXT_PUBLIC_APP_URL);
  activationUrl.searchParams.set("token", opaqueToken);
  const french = client.locale === "fr-CA";
  const subject = french ? "Ton accès Father Empowering" : "Your Father Empowering access";
  const text = french
    ? `Bonjour ${client.first_name},\n\nActive ton accès sécurisé : ${activationUrl.toString()}\n\nCe lien expire le ${invitation.expires_at}.`
    : `Hello ${client.first_name},\n\nActivate your secure access: ${activationUrl.toString()}\n\nThis link expires on ${invitation.expires_at}.`;

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
};

export const m1OutboxHandlers = {
  ClientInvitationCreated: deliverClientInvitation,
  ClientInvitationResent: deliverClientInvitation,
} as const;
