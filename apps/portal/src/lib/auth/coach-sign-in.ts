import "server-only";

import { z } from "zod";

import { M1ContractError, emailSchema } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const coachCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export async function signInCoachWithPassword(input: { email: string; password: string }) {
  const credentials = coachCredentialsSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    throw new M1ContractError("UNAUTHENTICATED", "Invalid credentials", 401);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role, status")
    .eq("user_id", data.user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError || !membership || !["ADMIN", "COACH"].includes(membership.role)) {
    await supabase.auth.signOut();
    throw new M1ContractError("FORBIDDEN", "Coach access required", 403);
  }

  const { error: auditError } = await supabase.rpc("record_m1_auth_event", {
    p_command: "CoachSignedIn",
    p_context: {},
  });
  if (auditError) {
    await supabase.auth.signOut();
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to audit sign-in", 503);
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { destination: assurance?.currentLevel === "aal2" ? "/coach" : "/mfa" } as const;
}
