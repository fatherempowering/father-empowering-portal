import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  userId: "11000000-0000-4000-8000-000000000001",
  sessionId: "21000000-0000-4000-8000-000000000001",
};

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  serverRpc: vi.fn(),
  createClient: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  evidenceSignOut: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/env", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    rpc: mocks.serverRpc,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.adminRpc }),
}));

import {
  maskCoachEmail,
  requestCoachEmailOtp,
  verifyCoachEmailOtp,
} from "@/lib/auth/coach-email-verification";

function accessToken(): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify({
      sub: ids.userId,
      session_id: ids.sessionId,
    })).toString("base64url"),
    "test-signature",
  ].join(".");
}

describe("Coach email verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ userId: ids.userId, role: "ADMIN" });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: ids.userId, email: "max@example.test" } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: accessToken() } },
      error: null,
    });
    mocks.serverRpc.mockResolvedValue({ data: null, error: null });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: { id: ids.userId },
        session: { access_token: "evidence-only" },
      },
      error: null,
    });
    mocks.evidenceSignOut.mockResolvedValue({ error: null });
    mocks.adminRpc.mockResolvedValue({ data: new Date().toISOString(), error: null });
    mocks.createClient.mockReturnValue({
      auth: {
        signInWithOtp: mocks.signInWithOtp,
        verifyOtp: mocks.verifyOtp,
        signOut: mocks.evidenceSignOut,
      },
    });
  });

  it("masks the destination without exposing the Coach address", () => {
    expect(maskCoachEmail("maxime@fatherempowering.com")).toBe("ma***@f***.com");
  });

  it("requests a code only for the authenticated password session", async () => {
    await expect(requestCoachEmailOtp("127.0.0.1")).resolves.toEqual({
      emailHint: "ma***@e***.test",
      retryAfterSeconds: 60,
    });

    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN", "COACH");
    expect(mocks.serverRpc).toHaveBeenNthCalledWith(
      1,
      "get_coach_email_verification_status",
    );
    expect(mocks.serverRpc).toHaveBeenNthCalledWith(
      2,
      "consume_m1_coach_email_otp_limit",
      {
        p_fingerprint_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_kind: "REQUEST_OTP",
      },
    );
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "max@example.test",
      options: { shouldCreateUser: false },
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "open_coach_email_otp_challenge",
      {
        p_user_id: ids.userId,
        p_session_id: ids.sessionId,
      },
    );
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://staging.example.supabase.co",
      "publishable-test-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  });

  it("uses the OTP session only as evidence and attests the original session", async () => {
    await verifyCoachEmailOtp("123 456", "127.0.0.1");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: "max@example.test",
      token: "123456",
      type: "email",
    });
    expect(mocks.evidenceSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.adminRpc).toHaveBeenCalledWith("attest_coach_email_session", {
      p_user_id: ids.userId,
      p_session_id: ids.sessionId,
    });
  });

  it("never attests a mismatched or invalid OTP identity", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: { id: "31000000-0000-4000-8000-000000000001" },
        session: { access_token: "evidence-only" },
      },
      error: null,
    });

    await expect(verifyCoachEmailOtp("123456", "127.0.0.1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid or expired code",
      status: 401,
    });
    expect(mocks.evidenceSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("fails closed when the password-session proof is rejected", async () => {
    mocks.serverRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "FE_COACH_PASSWORD_SESSION_REQUIRED" },
    });

    await expect(requestCoachEmailOtp("127.0.0.1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Coach password session required",
      status: 401,
    });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("does not claim delivery when the server cannot bind it to this session", async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: "private challenge store details" },
    });

    await expect(requestCoachEmailOtp("127.0.0.1")).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
      message: "Unable to send the Coach verification code",
      status: 503,
    });
    expect(mocks.signInWithOtp).toHaveBeenCalledOnce();
  });

  it("does not verify a code without a request window for this session", async () => {
    mocks.serverRpc
      .mockResolvedValueOnce({ data: { verified: false }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "FE_OTP_CHALLENGE_REQUIRED" },
      });

    await expect(verifyCoachEmailOtp("123456", "127.0.0.1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid or expired code",
      status: 401,
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("does not expose provider or attestation internals", async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: "private database details" },
    });

    await expect(verifyCoachEmailOtp("123456", "127.0.0.1")).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
      message: "Unable to finalize Coach verification",
      status: 503,
    });
  });

  it("returns the generic denial when the session window expires during verification", async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: "FE_OTP_CHALLENGE_REQUIRED" },
    });

    await expect(verifyCoachEmailOtp("123456", "127.0.0.1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid or expired code",
      status: 401,
    });
  });
});
