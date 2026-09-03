import "server-only";

import { recordStaffAuthAudit } from "@/lib/audit/staff-auth";
import { M1ContractError } from "@/lib/contracts/m1";
import { requireCoachAal2, requireRole } from "@/lib/auth/actor";
import { assertMfaEnrollmentAllowed } from "@/lib/auth/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function assertSixDigitCode(code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new M1ContractError("VALIDATION_FAILED", "A six-digit MFA code is required", 400);
  }
}

export async function listTotpFactors() {
  await requireRole("ADMIN", "COACH");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to list MFA factors", 503);
  return data.totp;
}

export async function enrollTotp(friendlyName = "Father Empowering") {
  const actor = await requireRole("ADMIN", "COACH");
  const supabase = await createServerSupabaseClient();
  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  if (factorError) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to inspect MFA factors", 503);
  }
  assertMfaEnrollmentAllowed(
    actor,
    factors.totp.some((factor) => factor.status === "verified"),
  );
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendlyName.slice(0, 64),
  });
  if (error) throw new M1ContractError("INVALID_STATE", "Unable to start MFA enrollment", 409);
  return data;
}

export async function verifyTotpFactor(factorId: string, code: string) {
  const actor = await requireRole("ADMIN", "COACH");
  assertSixDigitCode(code);
  const supabase = await createServerSupabaseClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) {
    throw new M1ContractError("INVALID_STATE", "Unable to create an MFA challenge", 409);
  }

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error) throw new M1ContractError("FORBIDDEN", "Invalid MFA code", 403);
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance?.currentLevel !== "aal2") {
    await supabase.auth.signOut();
    throw new M1ContractError("FORBIDDEN", "MFA assurance was not elevated", 403);
  }
  try {
    await recordStaffAuthAudit(
      { ...actor, aal: "aal2" },
      { command: "CoachMfaVerified", factorId },
    );
  } catch (auditError) {
    await supabase.auth.signOut();
    throw auditError;
  }
  return data;
}

export async function unenrollTotp(factorId: string) {
  await requireCoachAal2();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new M1ContractError("INVALID_STATE", "Unable to remove MFA factor", 409);
  return data;
}
