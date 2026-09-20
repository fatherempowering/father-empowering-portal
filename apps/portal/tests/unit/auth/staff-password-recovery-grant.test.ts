import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  issueStaffPasswordRecoveryGrant,
  sessionIdentityFromAccessToken,
  verifyStaffPasswordRecoveryGrant,
} from "@/lib/auth/staff-password-recovery-grant";

const identity = {
  userId: "11000000-0000-4000-8000-000000000001",
  sessionId: "21000000-0000-4000-8000-000000000001",
};

function testJwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

describe("staff password recovery grant", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.example.test");
    vi.stubEnv(
      "STAFF_PASSWORD_RECOVERY_SECRET",
      "independent-test-recovery-secret-at-least-32-characters",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("binds a signed ten-minute grant to the exact user and Auth session", () => {
    const token = issueStaffPasswordRecoveryGrant(identity, 1_000);

    expect(verifyStaffPasswordRecoveryGrant(token, identity, 1_599)).toMatchObject({
      userId: identity.userId,
      sessionId: identity.sessionId,
      expiresAt: 1_600,
    });
    expect(
      verifyStaffPasswordRecoveryGrant(token, { ...identity, sessionId: "31000000-0000-4000-8000-000000000001" }, 1_001),
    ).toBeNull();
    expect(
      verifyStaffPasswordRecoveryGrant(token, { ...identity, userId: "41000000-0000-4000-8000-000000000001" }, 1_001),
    ).toBeNull();
    expect(verifyStaffPasswordRecoveryGrant(token, identity, 1_600)).toBeNull();
  });

  it("rejects a modified or unsigned browser grant", () => {
    const token = issueStaffPasswordRecoveryGrant(identity, 1_000);
    const [payload, signature] = token.split(".");

    expect(
      verifyStaffPasswordRecoveryGrant(`${payload}x.${signature}`, identity, 1_001),
    ).toBeNull();
    expect(verifyStaffPasswordRecoveryGrant(payload, identity, 1_001)).toBeNull();
  });

  it("extracts only UUID user and session claims from an access token", () => {
    expect(
      sessionIdentityFromAccessToken(
        testJwt({ sub: identity.userId, session_id: identity.sessionId }),
      ),
    ).toEqual(identity);
    expect(() => sessionIdentityFromAccessToken(testJwt({ sub: identity.userId }))).toThrow();
    expect(() => sessionIdentityFromAccessToken("not-a-jwt")).toThrow();
  });
});
