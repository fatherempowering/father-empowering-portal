import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import type {
  ClientActivationDependencies,
  InvitationRecord,
} from "@/features/client/activation/contracts";
import { ClientActivationError } from "@/features/client/activation/errors";
import type { ClientDashboardDependencies } from "@/features/client/dashboard/contracts";
import { requireRole } from "@/lib/auth/actor";
import { hashInvitationToken } from "@/lib/auth/invitation-token";
import { acceptClientInvitationResultSchema, M1ContractError } from "@/lib/contracts/m1";
import { getPublicEnvironment } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

function correlationUuid(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return randomUUID();
}

async function resolveInvitation(opaqueToken: string, now = new Date()): Promise<InvitationRecord | null> {
  const tokenHash = hashInvitationToken(opaqueToken);
  const admin = createAdminSupabaseClient();
  const { data: invitation, error } = await admin
    .from("client_invitations")
    .select("id, client_id, email, expires_at, status")
    .eq("token_hash", tokenHash)
    .eq("status", "SENT")
    .maybeSingle();
  if (error || !invitation || Date.parse(invitation.expires_at) <= now.getTime()) return null;

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("locale")
    .eq("id", invitation.client_id)
    .single();
  if (clientError || !client) return null;
  return {
    id: invitation.id,
    emailHint: maskEmail(invitation.email),
    expiresAt: new Date(invitation.expires_at),
    locale: client.locale as "fr-CA" | "en-CA",
  };
}

async function invitationEmail(opaqueToken: string) {
  const tokenHash = hashInvitationToken(opaqueToken);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("client_invitations")
    .select("id, email, expires_at, status")
    .eq("token_hash", tokenHash)
    .eq("status", "SENT")
    .maybeSingle();
  if (error || !data || Date.parse(data.expires_at) <= Date.now()) {
    throw new ClientActivationError("INVITATION_UNAVAILABLE", "Invitation is unavailable.");
  }
  return { ...data, tokenHash };
}

export function createClientM1Dependencies(): {
  activation: ClientActivationDependencies;
  dashboard: ClientDashboardDependencies;
} {
  // This lazy client belongs to one workflow instance/request. Verification and
  // the acceptance RPC therefore share the exact SSR cookie adapter/session.
  let requestClient: ReturnType<typeof createServerSupabaseClient> | null = null;
  const serverClient = () => (requestClient ??= createServerSupabaseClient());

  const activation: ClientActivationDependencies = {
    invitations: {
      findUsableByOpaqueToken: resolveInvitation,
      async acceptAtomically({ opaqueToken }) {
        const supabase = await serverClient();
        const { data, error } = await supabase.rpc("accept_client_invitation", {
          p_token_hash: hashInvitationToken(opaqueToken),
        });
        if (error) throw new M1ContractError("INVALID_STATE", "Activation failed", 409);
        return acceptClientInvitationResultSchema.parse(data);
      },
    },
    otp: {
      async sendInvitationOtp({ opaqueToken }) {
        const invitation = await invitationEmail(opaqueToken);
        const environment = getPublicEnvironment();
        const authClient = createClient(
          environment.NEXT_PUBLIC_SUPABASE_URL,
          environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { error } = await authClient.auth.signInWithOtp({
          email: invitation.email,
          options: { shouldCreateUser: false },
        });
        if (error) throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "OTP send failed", 503);
      },
      async verifyInvitationOtp({ opaqueToken, token }) {
        const invitation = await invitationEmail(opaqueToken);
        const supabase = await serverClient();
        const { data, error } = await supabase.auth.verifyOtp({
          email: invitation.email,
          token,
          type: "email",
        });
        if (error || !data.user) throw new Error("OTP_REJECTED");
        return { authUserId: data.user.id };
      },
    },
    limiter: {
      async consume(input) {
        const admin = createAdminSupabaseClient();
        const fingerprintHash = createHash("sha256")
          .update(input.requestFingerprint)
          .digest("hex");
        const { error } = await admin.rpc("consume_m1_activation_limit", {
          p_invitation_id: input.invitationId,
          p_fingerprint_hash: fingerprintHash,
          p_kind: input.kind,
        });
        if (error) {
          throw new ClientActivationError("RATE_LIMITED", "Too many activation attempts.");
        }
      },
    },
    audit: {
      async append(input) {
        const admin = createAdminSupabaseClient();
        const { data: invitation, error: lookupError } = await admin
          .from("client_invitations")
          .select("organization_id, client_id")
          .eq("id", input.invitationId)
          .single();
        if (lookupError) throw lookupError;
        const { error } = await admin.from("audit_events").insert({
          organization_id: invitation.organization_id,
          actor_user_id: null,
          actor_role: null,
          command:
            input.action === "CLIENT_INVITATION_VIEWED"
              ? "ClientInvitationViewed"
              : "ClientOtpRequested",
          entity_type: "client_invitation",
          entity_id: input.invitationId,
          result: "SUCCEEDED",
          correlation_id: correlationUuid(input.correlationId),
          context: { clientId: invitation.client_id },
        });
        if (error) throw error;
      },
    },
    clock: () => new Date(),
  };

  const dashboard: ClientDashboardDependencies = {
    session: {
      async requireClientActor() {
        const actor = await requireRole("CLIENT");
        if (!actor.clientId) throw new M1ContractError("FORBIDDEN", "Client link required", 403);
        return {
          userId: actor.userId,
          organizationId: actor.organizationId,
          clientId: actor.clientId,
          role: "CLIENT",
        };
      },
    },
    dashboards: {
      async findForActor(actor) {
        const supabase = await createServerSupabaseClient();
        const { data, error } = await supabase
          .from("clients")
          .select("id, first_name, last_name, status, locale, time_zone")
          .eq("id", actor.clientId)
          .eq("organization_id", actor.organizationId)
          .eq("auth_user_id", actor.userId)
          .eq("status", "ACTIVE")
          .maybeSingle();
        if (error || !data) return null;
        return {
          clientId: data.id,
          displayName: `${data.first_name} ${data.last_name}`,
          status: "ACTIVE",
          locale: data.locale as "fr-CA" | "en-CA",
          timezone: data.time_zone,
        };
      },
    },
  };

  return { activation, dashboard };
}
