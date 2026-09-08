import "server-only";

import { requireRole } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutClientSession(): Promise<void> {
  await requireRole("CLIENT");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to sign out the client session",
      503,
    );
  }
}
