import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  membershipLimit: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: { getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel },
    },
    from: vi.fn((table: string) => {
      if (table !== "organization_memberships") {
        throw new Error(`Unexpected table ${table}`);
      }
      const query = { select: vi.fn(), eq: vi.fn(), limit: mocks.membershipLimit };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    }),
    rpc: mocks.rpc,
  }),
}));

import { requireCoachVerified } from "@/lib/auth/actor";

describe("verified Coach actor guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    mocks.membershipLimit.mockResolvedValue({
      data: [{
        id: "21000000-0000-4000-8000-000000000001",
        organization_id: "31000000-0000-4000-8000-000000000001",
        role: "ADMIN",
      }],
      error: null,
    });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1" },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { verified: true, expiresAt: "2027-03-19T00:00:00.000Z" },
      error: null,
    });
  });

  it("accepts an aal1 staff actor only with the private session attestation", async () => {
    await expect(requireCoachVerified()).resolves.toMatchObject({
      role: "ADMIN",
      aal: "aal1",
      coachVerified: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_coach_email_verification_status");
  });

  it("rejects a valid password session without its attestation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { verified: false, expiresAt: null },
      error: null,
    });
    await expect(requireCoachVerified()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Coach email verification is required",
      status: 403,
    });
  });

  it("fails closed without exposing an unreadable verification store", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private details" },
    });
    await expect(requireCoachVerified()).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
      message: "Unable to verify the Coach session",
      status: 503,
    });
  });
});
