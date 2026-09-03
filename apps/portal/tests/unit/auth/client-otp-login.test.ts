import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  clientLookup: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getServerActor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithOtp: mocks.signInWithOtp } }),
}));
vi.mock("@/lib/env", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon",
  }),
}));
vi.mock("@/lib/auth/actor", () => ({ getServerActor: mocks.getServerActor }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import {
  requestClientLoginOtp,
  verifyClientLoginOtp,
} from "@/lib/auth/client-otp-login";

function clientLookupQuery() {
  const query = {
    eq: vi.fn(),
    not: vi.fn(),
    limit: mocks.clientLookup,
  };
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  return query;
}

describe("returning Client OTP anti-enumeration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.clientLookup.mockResolvedValue({ data: [], error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "clients") throw new Error(`Unexpected table ${table}`);
      return { select: () => clientLookupQuery() };
    });
  });

  it("throttles an unknown OTP request before resolving account state", async () => {
    await requestClientLoginOtp("unknown@example.test", "request-fingerprint");

    expect(mocks.rpc).toHaveBeenCalledWith("consume_m1_client_otp_limit", {
      p_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_fingerprint_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_kind: "REQUEST_OTP",
    });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clientLookup.mock.invocationCallOrder[0],
    );
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("throttles an unknown OTP verification before lookup and returns the generic denial", async () => {
    await expect(
      verifyClientLoginOtp("unknown@example.test", "123456", "verify-fingerprint"),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid or expired code",
      status: 401,
    });

    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clientLookup.mock.invocationCallOrder[0],
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("maps a verification throttle or limiter failure to the same generic denial", async () => {
    for (const message of ["FE_RATE_LIMITED", "database unavailable"]) {
      vi.clearAllMocks();
      mocks.rpc.mockResolvedValueOnce({ error: { message } });

      await expect(
        verifyClientLoginOtp("client@example.test", "123456", "verify-fingerprint"),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        message: "Invalid or expired code",
        status: 401,
      });
      expect(mocks.clientLookup).not.toHaveBeenCalled();
    }
  });
});
