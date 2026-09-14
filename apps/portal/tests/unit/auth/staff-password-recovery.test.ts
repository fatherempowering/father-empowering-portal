import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  membershipResult: {
    data: [{
      id: "31000000-0000-4000-8000-000000000001",
      organization_id: "41000000-0000-4000-8000-000000000001",
      role: "ADMIN",
    }],
    error: null,
  } as { data: Array<Record<string, string>>; error: unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signOut: mocks.signOut,
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
    },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn(),
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.limit.mockImplementation(async () => mocks.membershipResult);
      return chain;
    }),
  }),
}));

import {
  exchangeStaffPasswordRecoveryCode,
  requestStaffPasswordRecovery,
  updateStaffPassword,
} from "@/lib/auth/staff-password-recovery";
import { issueStaffPasswordRecoveryGrant } from "@/lib/auth/staff-password-recovery-grant";

const userId = "11000000-0000-4000-8000-000000000001";
const sessionId = "21000000-0000-4000-8000-000000000001";

function testAccessToken(): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString("base64url"),
    "test-signature",
  ].join(".");
}

describe("standard Supabase staff password recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.example.test");
    vi.stubEnv(
      "STAFF_PASSWORD_RECOVERY_SECRET",
      "independent-test-recovery-secret-at-least-32-characters",
    );
    mocks.membershipResult = {
      data: [{
        id: "31000000-0000-4000-8000-000000000001",
        organization_id: "41000000-0000-4000-8000-000000000001",
        role: "ADMIN",
      }],
      error: null,
    };
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: userId },
        session: { access_token: testAccessToken() },
        redirectType: "recovery",
      },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: testAccessToken() } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests the native PKCE recovery flow only to the canonical callback", async () => {
    await requestStaffPasswordRecovery("  MAX@Example.Test ");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "max@example.test",
      {
        redirectTo:
          "https://preview.example.test/auth/callback?next=%2Freset-password",
      },
    );
  });

  it("accepts only a recovery exchange for exactly one active staff membership", async () => {
    await expect(exchangeStaffPasswordRecoveryCode("pkce-code")).resolves.toEqual({
      userId,
      sessionId,
    });

    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        user: { id: userId },
        session: { access_token: testAccessToken() },
        redirectType: null,
      },
      error: null,
    });
    await expect(exchangeStaffPasswordRecoveryCode("ordinary-code")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses a Client recovery session without changing permissions", async () => {
    mocks.membershipResult = {
      data: [{
        id: "31000000-0000-4000-8000-000000000001",
        organization_id: "41000000-0000-4000-8000-000000000001",
        role: "CLIENT",
      }],
      error: null,
    };

    await expect(exchangeStaffPasswordRecoveryCode("client-code")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("updates through a session-bound grant and revokes all recovery sessions", async () => {
    const grant = issueStaffPasswordRecoveryGrant({ userId, sessionId });

    await updateStaffPassword(grant, "A-new-password-for-Max!123");

    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "A-new-password-for-Max!123",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("does not let an ordinary authenticated staff session update a password", async () => {
    await expect(
      updateStaffPassword(undefined, "A-new-password-for-Max!123"),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalledWith({ scope: "global" });
  });
});
