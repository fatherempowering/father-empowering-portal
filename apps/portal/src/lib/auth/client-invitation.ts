import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  acceptClientInvitationResultSchema,
  invitationOtpContextSchema,
  M1ContractError,
  type AcceptClientInvitationResult,
  type InvitationOtpContext,
} from "@/lib/contracts/m1";
import { getPublicEnvironment } from "@/lib/env";
export { hashInvitationToken } from "@/lib/auth/invitation-token";
import { hashInvitationToken } from "@/lib/auth/invitation-token";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export async function resolveInvitationForOtp(tokenHash: string): Promise<InvitationOtpContext> {
  if (!HASH_PATTERN.test(tokenHash)) {
    throw new M1ContractError("NOT_FOUND", "Invitation not found", 404);
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("client_invitations")
    .select("id, email, expires_at, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.status !== "SENT" || Date.parse(data.expires_at) <= Date.now()) {
    throw new M1ContractError("NOT_FOUND", "Invitation not found", 404);
  }

  return invitationOtpContextSchema.parse({
    invitationId: data.id,
    email: data.email,
    emailHint: maskEmail(data.email),
    expiresAt: data.expires_at,
  });
}

export async function requestInvitationOtp(tokenHash: string): Promise<InvitationOtpContext> {
  const invitation = await resolveInvitationForOtp(tokenHash);
  const environment = getPublicEnvironment();
  const authClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await authClient.auth.signInWithOtp({
    email: invitation.email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to send login code", 503);
  }
  return invitation;
}

export async function verifyInvitationOtp(
  tokenHash: string,
  otp: string,
): Promise<AcceptClientInvitationResult> {
  if (!/^\d{6}$/.test(otp)) {
    throw new M1ContractError("VALIDATION_FAILED", "A six-digit code is required", 400);
  }
  const invitation = await resolveInvitationForOtp(tokenHash);
  const supabase = await createServerSupabaseClient();
  const { error: verificationError } = await supabase.auth.verifyOtp({
    email: invitation.email,
    token: otp,
    type: "email",
  });
  if (verificationError) {
    throw new M1ContractError("FORBIDDEN", "Invalid or expired login code", 403);
  }

  // The RPC derives the user and verified email from the new Auth session.
  const { data, error } = await supabase.rpc("accept_client_invitation", {
    p_token_hash: tokenHash,
  });
  if (error) {
    throw new M1ContractError("INVALID_STATE", "Unable to activate invitation", 409);
  }
  return acceptClientInvitationResultSchema.parse(data);
}
