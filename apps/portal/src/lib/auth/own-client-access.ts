import "server-only";

import { requireActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError, type ServerActor } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** A personal data capability, never a replacement for the actor's real role. */
export type OwnClientAccess = ServerActor & { ownClientId: string };

export async function getStaffPersonalProfile() {
  const actor = await requireCoachVerified();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, status")
    .eq("organization_id", actor.organizationId)
    .eq("auth_user_id", actor.userId)
    .maybeSingle();
  if (error) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to load personal profile", 503);
  }
  return { actor, profile: data as { id: string; status: string } | null };
}

export async function requireOwnClientAccess(): Promise<OwnClientAccess> {
  const actor = await requireActor();
  if (actor.role === "CLIENT") {
    if (!actor.clientId) {
      throw new M1ContractError("FORBIDDEN", "Client identity is not linked", 403);
    }
    return { ...actor, ownClientId: actor.clientId };
  }

  // The verified staff guard and canonical ServerActor.clientId=null invariant
  // remain unchanged. An email-OTP or recovery session cannot use this path.
  const { actor: staff, profile } = await getStaffPersonalProfile();
  if (!profile) throw new M1ContractError("NOT_FOUND", "Personal profile is not active", 404);
  if (profile.status !== "ACTIVE") {
    throw new M1ContractError("FORBIDDEN", "Personal profile is not active", 403);
  }
  return { ...staff, ownClientId: profile.id };
}
