import "server-only";

import { z } from "zod";

import { recordStaffAuthAudit } from "@/lib/audit/staff-auth";
import {
  M1ContractError,
  emailSchema,
  serverActorSchema,
} from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const coachCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export async function signInCoachWithPassword(input: { email: string; password: string }) {
  const parsed = coachCredentialsSchema.safeParse(input);
  if (!parsed.success) {
    throw new M1ContractError("UNAUTHENTICATED", "Invalid credentials", 401);
  }
  const credentials = parsed.data;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error && ["invalid_credentials", "email_not_confirmed", "user_banned"].includes(error.code ?? "")) {
    throw new M1ContractError("UNAUTHENTICATED", "Invalid credentials", 401);
  }
  if (error || !data.user) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to sign in", 503);
  }

  try {
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id, organization_id, role, status")
      .eq("user_id", data.user.id)
      .eq("status", "ACTIVE")
      .abortSignal(AbortSignal.timeout(10_000))
      .maybeSingle();
    if (membershipError) {
      throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to verify Coach access", 503);
    }
    if (!membership || !["ADMIN", "COACH"].includes(membership.role)) {
      throw new M1ContractError("FORBIDDEN", "Coach access required", 403);
    }

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || !assurance?.currentLevel) {
      throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to verify assurance", 503);
    }

    const actor = serverActorSchema.parse({
      userId: data.user.id,
      organizationId: membership.organization_id,
      membershipId: membership.id,
      clientId: null,
      role: membership.role,
      aal: assurance.currentLevel,
    });
    await recordStaffAuthAudit(actor, { command: "CoachSignedIn" });
  } catch (error) {
    // A failed access check must not revoke sessions on the Coach's other devices.
    // Cleanup errors must not replace the safe, original failure classification.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch { /* Access remains denied by the existing Coach guards. */ }
    if (error instanceof M1ContractError) throw error;
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to verify Coach access", 503);
  }

  return { destination: "/verify-email" } as const;
}
