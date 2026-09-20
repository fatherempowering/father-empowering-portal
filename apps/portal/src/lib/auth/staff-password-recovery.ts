import "server-only";

import { z } from "zod";

import {
  emailSchema,
  M1ContractError,
  type ServerActor,
} from "@/lib/contracts/m1";
import { getPublicEnvironment } from "@/lib/env";
import {
  sessionIdentityFromAccessToken,
  verifyStaffPasswordRecoveryGrant,
} from "@/lib/auth/staff-password-recovery-grant";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const staffPasswordSchema = z.string().min(12).max(200);

export async function requestStaffPasswordRecovery(rawEmail: unknown): Promise<void> {
  const email = emailSchema.parse(rawEmail);
  const environment = getPublicEnvironment();
  const supabase = await createServerSupabaseClient();
  const redirectTo = new URL("/auth/callback", environment.NEXT_PUBLIC_APP_URL);
  redirectTo.searchParams.set("next", "/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });
  if (error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to request password recovery",
      503,
    );
  }
}

export async function exchangeStaffPasswordRecoveryCode(code: string): Promise<{
  userId: string;
  sessionId: string;
  requiresMfa: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  // auth-js carries the PKCE verifier's `/recovery` marker through this
  // runtime field, although the current public AuthTokenResponse type omits it.
  const redirectType = (data as typeof data & { redirectType?: unknown })
    .redirectType;
  if (
    error ||
    redirectType !== "recovery" ||
    !data.user ||
    !data.session?.access_token
  ) {
    await supabase.auth.signOut({ scope: "local" });
    throw new M1ContractError(
      "UNAUTHENTICATED",
      "Password recovery link is invalid or expired",
      401,
    );
  }

  const identity = sessionIdentityFromAccessToken(data.session.access_token);
  if (identity.userId !== data.user.id) {
    await supabase.auth.signOut({ scope: "local" });
    throw new M1ContractError("FORBIDDEN", "Staff access required", 403);
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role")
    .eq("user_id", data.user.id)
    .eq("status", "ACTIVE")
    .limit(2);
  if (
    membershipError ||
    memberships?.length !== 1 ||
    !["ADMIN", "COACH"].includes(memberships[0].role)
  ) {
    await supabase.auth.signOut({ scope: "local" });
    throw new M1ContractError("FORBIDDEN", "Staff access required", 403);
  }

  return {
    ...identity,
    requiresMfa: false,
  };
}

export async function requireStaffPasswordRecoveryGrant(
  token: string | undefined,
): Promise<ServerActor> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (userError || !user || sessionError || !sessionData.session?.access_token) {
    throw new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  }

  let identity: { userId: string; sessionId: string };
  try {
    identity = sessionIdentityFromAccessToken(sessionData.session.access_token);
  } catch {
    throw new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  }
  if (identity.userId !== user.id || !verifyStaffPasswordRecoveryGrant(token, identity)) {
    throw new M1ContractError(
      "UNAUTHENTICATED",
      "Password recovery authorization is invalid or expired",
      401,
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(2);
  if (
    membershipError ||
    memberships?.length !== 1 ||
    !["ADMIN", "COACH"].includes(memberships[0].role)
  ) {
    throw new M1ContractError("FORBIDDEN", "Staff access required", 403);
  }

  return {
    userId: user.id,
    organizationId: memberships[0].organization_id,
    membershipId: memberships[0].id,
    clientId: null,
    role: memberships[0].role,
    aal: "aal1",
  };
}

export async function updateStaffPassword(
  token: string | undefined,
  rawPassword: unknown,
): Promise<void> {
  await requireStaffPasswordRecoveryGrant(token);
  const password = staffPasswordSchema.parse(rawPassword);
  const supabase = await createServerSupabaseClient();
  const { error: revokeError } = await supabase.rpc(
    "revoke_all_coach_email_attestations",
  );
  if (revokeError) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to revoke existing Coach verifications",
      503,
    );
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to update password",
      503,
    );
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to close recovery sessions",
      503,
    );
  }
}
