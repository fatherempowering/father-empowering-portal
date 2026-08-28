import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { getServerActor } from "@/lib/auth/actor";
import {
  emailSchema,
  M1ContractError,
  type ServerActor,
} from "@/lib/contracts/m1";
import { getPublicEnvironment } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const otpSchema = /^[0-9]{6}$/;

type ActiveClientIdentity = Readonly<{
  id: string;
  organizationId: string;
  authUserId: string;
  email: string;
}>;

type ClientAuditIdentity = Pick<
  ServerActor,
  "userId" | "organizationId" | "clientId" | "aal"
>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function findActiveClient(email: string): Promise<ActiveClientIdentity | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("clients")
    .select("id, organization_id, auth_user_id, email")
    .eq("email", email)
    .eq("status", "ACTIVE")
    .not("auth_user_id", "is", null)
    .limit(2);
  if (error) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to resolve client login", 503);
  }
  if (data.length !== 1 || !data[0]?.auth_user_id) return null;
  return {
    id: data[0].id,
    organizationId: data[0].organization_id,
    authUserId: data[0].auth_user_id,
    email: data[0].email,
  };
}

async function consumeLimit(
  email: string,
  fingerprint: string,
  kind: "REQUEST_OTP" | "VERIFY_OTP",
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("consume_m1_client_otp_limit", {
    p_email_hash: digest(email),
    p_fingerprint_hash: digest(fingerprint),
    p_kind: kind,
  });
  if (!error) return;
  if (error.message.includes("FE_RATE_LIMITED")) {
    throw new M1ContractError("RATE_LIMITED", "Too many login attempts", 429);
  }
  throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to protect client login", 503);
}

async function appendClientAuthAudit(
  actor: ClientAuditIdentity,
  command: "ClientOtpRequested" | "ClientSignedIn",
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_user_id: command === "ClientSignedIn" ? actor.userId : null,
    actor_role: command === "ClientSignedIn" ? "CLIENT" : null,
    command,
    entity_type: "client",
    entity_id: actor.clientId,
    result: "SUCCEEDED",
    correlation_id: randomUUID(),
    context: { aal: actor.aal, flow: "email_otp" },
  });
  if (error) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to audit client login", 503);
  }
}

export async function requestClientLoginOtp(
  rawEmail: unknown,
  fingerprint: string,
): Promise<void> {
  const email = emailSchema.parse(rawEmail);
  const client = await findActiveClient(email);

  // The public response is intentionally identical for unknown or inactive
  // addresses and no Auth user is ever created by this path.
  if (!client) return;

  await consumeLimit(email, fingerprint, "REQUEST_OTP");
  const environment = getPublicEnvironment();
  const authClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to send client login code", 503);
  }

  await appendClientAuthAudit(
    {
      userId: client.authUserId,
      organizationId: client.organizationId,
      clientId: client.id,
      aal: "aal1",
    },
    "ClientOtpRequested",
  );
}

export async function verifyClientLoginOtp(
  rawEmail: unknown,
  rawOtp: unknown,
  fingerprint: string,
): Promise<ServerActor> {
  const email = emailSchema.parse(rawEmail);
  const otp = typeof rawOtp === "string" ? rawOtp.replaceAll(" ", "") : "";
  if (!otpSchema.test(otp)) {
    throw new M1ContractError("VALIDATION_FAILED", "A six-digit code is required", 400);
  }

  const client = await findActiveClient(email);
  if (!client) throw new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401);
  await consumeLimit(email, fingerprint, "VERIFY_OTP");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error || !data.user || data.user.id !== client.authUserId) {
    await supabase.auth.signOut();
    throw new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401);
  }

  const actor = await getServerActor();
  if (
    !actor ||
    actor.role !== "CLIENT" ||
    actor.userId !== client.authUserId ||
    actor.organizationId !== client.organizationId ||
    actor.clientId !== client.id
  ) {
    await supabase.auth.signOut();
    throw new M1ContractError("FORBIDDEN", "Client access is not active", 403);
  }

  try {
    await appendClientAuthAudit(actor, "ClientSignedIn");
  } catch (auditError) {
    await supabase.auth.signOut();
    throw auditError;
  }
  return actor;
}
