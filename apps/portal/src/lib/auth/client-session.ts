import "server-only";

import { requireActor } from "@/lib/auth/actor";
import { signOutCoachSession } from "@/lib/auth/coach-session";
import { M1ContractError } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutClientSession(): Promise<"/login" | "/client-login"> {
  const actor = await requireActor();
  // Both personal and Coach surfaces use the SAME staff session. Logout must
  // revoke its existing assurance, not merely hide one of the two surfaces.
  if (actor.role === "ADMIN" || actor.role === "COACH") {
    await signOutCoachSession();
    return "/login";
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to sign out the client session",
      503,
    );
  }
  return "/client-login";
}
