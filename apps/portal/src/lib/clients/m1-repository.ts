import "server-only";

import { randomBytes } from "node:crypto";

import { requireCoachAal2, requireRole } from "@/lib/auth/actor";
import { hashInvitationToken } from "@/lib/auth/invitation-token";
import {
  createClientInputSchema,
  createClientResultSchema,
  M1ContractError,
  sendClientInvitationResultSchema,
  uuidSchema,
  type ClientSummary,
  type CreateClientInput,
  type InvitationSummary,
} from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function placeholderTokenHash() {
  // The delivery worker replaces this digest with its retry-stable token before
  // marking the invitation SENT. No raw invitation token is persisted here.
  return hashInvitationToken(randomBytes(32).toString("base64url"));
}

export async function listCoachClients(): Promise<
  Array<{ client: ClientSummary; invitation: InvitationSummary | null }>
> {
  await requireCoachAal2();
  const supabase = await createServerSupabaseClient();
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select(
      "id, organization_id, auth_user_id, email, first_name, last_name, locale, time_zone, status, created_at",
    )
    .in("status", ["INVITED", "ACTIVE", "SUSPENDED"])
    .order("created_at", { ascending: false });
  if (clientsError) throw mapRpcError(clientsError);
  if (!clients?.length) return [];

  const clientIds = clients.map((client) => client.id);
  const [{ data: assignments, error: assignmentsError }, { data: invitations, error: invitationsError }] =
    await Promise.all([
      supabase
        .from("coach_client_assignments")
        .select("client_id, coach_user_id")
        .in("client_id", clientIds)
        .eq("is_primary", true)
        .in("status", ["PENDING", "ACTIVE", "PAUSED"]),
      supabase
        .from("client_invitations")
        .select("id, client_id, email, status, expires_at, sent_at, accepted_at, created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false }),
    ]);
  if (assignmentsError) throw mapRpcError(assignmentsError);
  if (invitationsError) throw mapRpcError(invitationsError);

  const assignmentByClient = new Map(
    (assignments ?? []).map((assignment) => [assignment.client_id, assignment]),
  );
  const invitationByClient = new Map<string, NonNullable<typeof invitations>[number]>();
  for (const invitation of invitations ?? []) {
    if (!invitationByClient.has(invitation.client_id)) {
      invitationByClient.set(invitation.client_id, invitation);
    }
  }

  return clients.flatMap((client) => {
    const assignment = assignmentByClient.get(client.id);
    if (!assignment) return [];
    const invitation = invitationByClient.get(client.id);
    return [{
      client: {
        id: client.id,
        organizationId: client.organization_id,
        authUserId: client.auth_user_id,
        firstName: client.first_name,
        lastName: client.last_name,
        preferredName: null,
        displayName: `${client.first_name} ${client.last_name}`,
        email: client.email,
        locale: client.locale === "en-CA" ? "en" : "fr",
        timezone: client.time_zone,
        plannedStartDate: null,
        status: client.status,
        primaryCoachUserId: assignment.coach_user_id,
        createdAt: client.created_at,
      },
      invitation: invitation
        ? {
            id: invitation.id,
            clientId: invitation.client_id,
            email: invitation.email,
            status: invitation.status,
            expiresAt: invitation.expires_at,
            sentAt: invitation.sent_at,
            acceptedAt: invitation.accepted_at,
          }
        : null,
    }];
  });
}

export async function getOwnClientDashboard() {
  const actor = await requireRole("CLIENT");
  if (!actor.clientId) {
    throw new M1ContractError("FORBIDDEN", "Client identity is not linked", 403);
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, organization_id, first_name, last_name, locale, time_zone, status")
    .eq("id", actor.clientId)
    .eq("organization_id", actor.organizationId)
    .eq("auth_user_id", actor.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) throw new M1ContractError("NOT_FOUND", "Client profile not found", 404);
  return {
    clientId: data.id,
    organizationId: data.organization_id,
    displayName: `${data.first_name} ${data.last_name}`,
    status: "ACTIVE" as const,
    locale: data.locale as "fr-CA" | "en-CA",
    timezone: data.time_zone,
  };
}

function mapRpcError(error: { message: string } | null) {
  const message = error?.message ?? "FE_TEMPORARILY_UNAVAILABLE";
  if (message.includes("FE_IDEMPOTENCY_CONFLICT")) {
    return new M1ContractError("DUPLICATE", "Idempotency key conflicts with another request", 409);
  }
  if (message.includes("FE_DUPLICATE")) {
    return new M1ContractError("DUPLICATE", "Client or invitation already exists", 409);
  }
  if (message.includes("FE_FORBIDDEN") || message.includes("FE_MFA")) {
    return new M1ContractError("FORBIDDEN", "Operation is not permitted", 403);
  }
  return new M1ContractError("INVALID_STATE", "M1 operation could not be completed", 409);
}

export async function createInvitedClient(input: CreateClientInput) {
  const actor = await requireCoachAal2();
  const parsed = createClientInputSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("create_invited_client", {
    p_organization_id: actor.organizationId,
    p_email: parsed.email,
    p_first_name: parsed.firstName,
    p_last_name: parsed.lastName,
    p_locale: parsed.locale,
    p_time_zone: parsed.timeZone,
    p_token_hash: placeholderTokenHash(),
    p_expires_at: expiresAt,
    p_idempotency_key: parsed.idempotencyKey,
    p_coach_user_id: actor.userId,
  });
  if (error) throw mapRpcError(error);
  return createClientResultSchema.parse(data);
}

export async function resendClientInvitation(input: {
  clientId: string;
  idempotencyKey: string;
}) {
  await requireCoachAal2();
  const clientId = uuidSchema.parse(input.clientId);
  const idempotencyKey = uuidSchema.parse(input.idempotencyKey);
  const supabase = await createServerSupabaseClient();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("resend_client_invitation", {
    p_client_id: clientId,
    p_token_hash: placeholderTokenHash(),
    p_expires_at: expiresAt,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw mapRpcError(error);
  return sendClientInvitationResultSchema.parse(data);
}

export async function revokeClientInvitation(input: {
  clientId: string;
  idempotencyKey: string;
  reason?: string;
}) {
  await requireCoachAal2();
  const clientId = uuidSchema.parse(input.clientId);
  const idempotencyKey = uuidSchema.parse(input.idempotencyKey);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("revoke_client_invitation_for_client", {
    p_client_id: clientId,
    p_reason: input.reason ?? "Révoquée par le coach",
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw mapRpcError(error);
  return data as { invitationId: string; status: "REVOKED" };
}
