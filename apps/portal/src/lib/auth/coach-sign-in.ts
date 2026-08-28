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
  const credentials = coachCredentialsSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    throw new M1ContractError("UNAUTHENTICATED", "Invalid credentials", 401);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, role, status")
    .eq("user_id", data.user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError || !membership || !["ADMIN", "COACH"].includes(membership.role)) {
    await supabase.auth.signOut();
    throw new M1ContractError("FORBIDDEN", "Coach access required", 403);
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || !assurance?.currentLevel) {
    await supabase.auth.signOut();
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
  try {
    await recordStaffAuthAudit(actor, { command: "CoachSignedIn" });
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }

  return { destination: actor.aal === "aal2" ? "/coach" : "/mfa" } as const;
}
