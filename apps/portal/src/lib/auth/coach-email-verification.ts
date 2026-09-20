import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireRole } from "@/lib/auth/actor";
import { sessionIdentityFromAccessToken } from "@/lib/auth/staff-password-recovery-grant";
import { M1ContractError, emailSchema, uuidSchema } from "@/lib/contracts/m1";
import { getPublicEnvironment } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const COACH_EMAIL_OTP_RETRY_AFTER_SECONDS = 60;

const otpSchema = z.string().regex(/^\d{6}$/);
const verificationStatusSchema = z.object({
  verified: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

type CoachPasswordSession = Readonly<{
  userId: string;
  sessionId: string;
  email: string;
}>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function statelessAuthClient() {
  const environment = getPublicEnvironment();
  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function maskCoachEmail(rawEmail: string): string {
  const email = emailSchema.parse(rawEmail);
  const separator = email.lastIndexOf("@");
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const domainSeparator = domain.lastIndexOf(".");
  const domainName = domainSeparator > 0 ? domain.slice(0, domainSeparator) : domain;
  const domainSuffix = domainSeparator > 0 ? domain.slice(domainSeparator) : "";
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  const visibleDomain = domainName.slice(0, 1);
  return `${visibleLocal}***@${visibleDomain}***${domainSuffix}`;
}

function mapSessionRpcError(error: { message: string } | null): M1ContractError {
  const message = error?.message ?? "";
  if (message.includes("FE_RATE_LIMITED")) {
    return new M1ContractError("RATE_LIMITED", "Too many verification attempts", 429);
  }
  if (message.includes("FE_OTP_CHALLENGE_REQUIRED")) {
    return new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401);
  }
  if (
    message.includes("FE_COACH_PASSWORD_SESSION_REQUIRED") ||
    message.includes("FE_UNAUTHENTICATED")
  ) {
    return new M1ContractError("UNAUTHENTICATED", "Coach password session required", 401);
  }
  if (message.includes("FE_FORBIDDEN")) {
    return new M1ContractError("FORBIDDEN", "Coach access required", 403);
  }
  return new M1ContractError(
    "TEMPORARILY_UNAVAILABLE",
    "Unable to verify the Coach session",
    503,
  );
}

async function readCoachPasswordSession(): Promise<{
  session: CoachPasswordSession;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}> {
  const actor = await requireRole("ADMIN", "COACH");
  const supabase = await createServerSupabaseClient();
  const userResult = await supabase.auth.getUser();
  const sessionResult = await supabase.auth.getSession();
  const statusResult = await supabase.rpc("get_coach_email_verification_status");

  const user = userResult.data.user;
  const accessToken = sessionResult.data.session?.access_token;
  if (userResult.error || sessionResult.error || !user?.email || !accessToken) {
    throw new M1ContractError("UNAUTHENTICATED", "Coach password session required", 401);
  }
  if (statusResult.error) throw mapSessionRpcError(statusResult.error);

  let identity: { userId: string; sessionId: string };
  try {
    identity = sessionIdentityFromAccessToken(accessToken);
  } catch {
    throw new M1ContractError("UNAUTHENTICATED", "Coach password session required", 401);
  }
  if (identity.userId !== user.id || identity.userId !== actor.userId) {
    throw new M1ContractError("FORBIDDEN", "Coach access required", 403);
  }

  return {
    session: {
      userId: uuidSchema.parse(identity.userId),
      sessionId: uuidSchema.parse(identity.sessionId),
      email: emailSchema.parse(user.email),
    },
    supabase,
  };
}

export async function getCoachEmailVerificationStatus(): Promise<{
  verified: boolean;
  expiresAt: string | null;
}> {
  await requireRole("ADMIN", "COACH");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_coach_email_verification_status");
  if (error) throw mapSessionRpcError(error);
  return verificationStatusSchema.parse(data);
}

async function consumeRateLimit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  fingerprint: string,
  kind: "REQUEST_OTP" | "VERIFY_OTP",
): Promise<void> {
  const { error } = await supabase.rpc("consume_m1_coach_email_otp_limit", {
    p_fingerprint_hash: digest(fingerprint),
    p_kind: kind,
  });
  if (error) throw mapSessionRpcError(error);
}

export async function requestCoachEmailOtp(fingerprint: string): Promise<{
  emailHint: string;
  retryAfterSeconds: number;
}> {
  const { session, supabase } = await readCoachPasswordSession();
  await consumeRateLimit(supabase, fingerprint, "REQUEST_OTP");

  const authClient = statelessAuthClient();
  const { error } = await authClient.auth.signInWithOtp({
    email: session.email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to send the Coach verification code",
      503,
    );
  }

  const admin = createAdminSupabaseClient();
  const { error: challengeError } = await admin.rpc(
    "open_coach_email_otp_challenge",
    {
      p_user_id: session.userId,
      p_session_id: session.sessionId,
    },
  );
  if (challengeError) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to send the Coach verification code",
      503,
    );
  }

  return {
    emailHint: maskCoachEmail(session.email),
    retryAfterSeconds: COACH_EMAIL_OTP_RETRY_AFTER_SECONDS,
  };
}

export async function verifyCoachEmailOtp(
  rawCode: unknown,
  fingerprint: string,
): Promise<void> {
  const code = otpSchema.parse(
    typeof rawCode === "string" ? rawCode.replaceAll(" ", "") : rawCode,
  );
  const { session, supabase } = await readCoachPasswordSession();
  await consumeRateLimit(supabase, fingerprint, "VERIFY_OTP");

  const authClient = statelessAuthClient();
  const { data, error } = await authClient.auth.verifyOtp({
    email: session.email,
    token: code,
    type: "email",
  });
  if (error || !data.user || !data.session || data.user.id !== session.userId) {
    if (data.session) await authClient.auth.signOut({ scope: "local" });
    throw new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401);
  }

  // Supabase verifies an account-bound code. The private request window and
  // the attestation RPC add the current password-session binding without
  // storing or independently validating the OTP in this application.
  // The OTP exchange creates a separate Supabase session. It is evidence only:
  // close it before attesting the original password session.
  const { error: evidenceSignOutError } = await authClient.auth.signOut({ scope: "local" });
  if (evidenceSignOutError) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to finalize Coach verification",
      503,
    );
  }

  const admin = createAdminSupabaseClient();
  const { error: attestationError } = await admin.rpc("attest_coach_email_session", {
    p_user_id: session.userId,
    p_session_id: session.sessionId,
  });
  if (attestationError) {
    if (
      attestationError.message.includes("FE_OTP_CHALLENGE_REQUIRED") ||
      attestationError.message.includes("FE_COACH_SESSION_REVOKED") ||
      attestationError.message.includes("FE_COACH_SESSION_EXPIRED") ||
      attestationError.message.includes("FE_COACH_PASSWORD_SESSION_REQUIRED")
    ) {
      throw new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401);
    }
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to finalize Coach verification",
      503,
    );
  }
}
