import "server-only";

import { requireRole } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutCoachSession(): Promise<void> {
  await requireRole("ADMIN", "COACH");
  const supabase = await createServerSupabaseClient();
  const { error: revokeError } = await supabase.rpc(
    "revoke_current_coach_email_attestation",
  );
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (revokeError || error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to sign out the staff session",
      503,
    );
  }
}
