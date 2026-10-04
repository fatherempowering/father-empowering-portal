import "server-only";

import { z } from "zod";
import { requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError, localeSchema, shortTextSchema, uuidSchema } from "@/lib/contracts/m1";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const createPersonalClientSchema = z.object({
  firstName: shortTextSchema,
  lastName: shortTextSchema,
  locale: localeSchema,
  timeZone: z.string().trim().min(1).max(100).refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }, "Invalid time zone"),
  idempotencyKey: uuidSchema,
}).strict();

export async function createPersonalClient(input: unknown): Promise<{ clientId: string }> {
  await requireCoachVerified();
  const parsed = createPersonalClientSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_own_client_profile", {
    p_first_name: parsed.firstName,
    p_last_name: parsed.lastName,
    p_locale: parsed.locale,
    p_time_zone: parsed.timeZone,
    p_idempotency_key: parsed.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("FE_UNAUTHENTICATED")) {
      throw new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
    }
    if (error.message.includes("FE_FORBIDDEN") || error.message.includes("FE_COACH_")) {
      throw new M1ContractError("FORBIDDEN", "Verified Coach access required", 403);
    }
    if (error.message.includes("FE_INVALID_")) {
      throw new M1ContractError("VALIDATION_FAILED", "Invalid personal profile", 400);
    }
    if (/FE_(?:IDEMPOTENCY_CONFLICT|PERSONAL_PROFILE_EXISTS|EMAIL_IDENTITY_CONFLICT)/.test(error.message)) {
      throw new M1ContractError("INVALID_STATE", "Personal profile cannot be created in its current state", 409);
    }
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to create personal profile", 503);
  }
  return z.object({ clientId: uuidSchema }).parse(data);
}
