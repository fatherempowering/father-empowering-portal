import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";
import { getStaffPasswordRecoveryEnvironment } from "@/lib/env";

export const STAFF_PASSWORD_RECOVERY_COOKIE = "fe-staff-recovery";
export const STAFF_PASSWORD_RECOVERY_MAX_AGE_SECONDS = 10 * 60;

const recoveryGrantSchema = z.object({
  version: z.literal(1),
  userId: uuidSchema,
  sessionId: uuidSchema,
  expiresAt: z.number().int().positive(),
});

type RecoveryGrant = z.infer<typeof recoveryGrantSchema>;

function sign(encodedPayload: string): Buffer {
  const { STAFF_PASSWORD_RECOVERY_SECRET } =
    getStaffPasswordRecoveryEnvironment();
  return createHmac("sha256", STAFF_PASSWORD_RECOVERY_SECRET)
    .update("staff-password-recovery-v1\0", "utf8")
    .update(encodedPayload, "utf8")
    .digest();
}

export function sessionIdentityFromAccessToken(accessToken: string): {
  userId: string;
  sessionId: string;
} {
  const segments = accessToken.split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new Error("Invalid session token");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid session token");
  }

  const claims = z.object({
    sub: uuidSchema,
    session_id: uuidSchema,
  }).parse(parsed);
  return { userId: claims.sub, sessionId: claims.session_id };
}

export function issueStaffPasswordRecoveryGrant(
  identity: { userId: string; sessionId: string },
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  const grant = recoveryGrantSchema.parse({
    version: 1,
    ...identity,
    expiresAt: nowSeconds + STAFF_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  });
  const payload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function verifyStaffPasswordRecoveryGrant(
  token: string | undefined,
  identity: { userId: string; sessionId: string },
  nowSeconds = Math.floor(Date.now() / 1_000),
): RecoveryGrant | null {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null;

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(segments[1], "base64url");
  } catch {
    return null;
  }
  const expectedSignature = sign(segments[0]);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  let grant: RecoveryGrant;
  try {
    grant = recoveryGrantSchema.parse(
      JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }

  if (
    grant.expiresAt <= nowSeconds ||
    grant.userId !== identity.userId ||
    grant.sessionId !== identity.sessionId
  ) {
    return null;
  }
  return grant;
}
