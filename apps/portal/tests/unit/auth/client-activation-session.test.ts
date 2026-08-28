import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { createClientM1Dependencies } from "@/lib/composition/client-m1";

const token = "opaque-invitation-token-with-at-least-thirty-two-characters";

describe("Client activation session cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs out the OTP session when atomic invitation acceptance fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "stale invitation" } });
    const dependencies = createClientM1Dependencies();

    await expect(
      dependencies.activation.invitations.acceptAtomically({
        opaqueToken: token,
        authUserId: "11000000-0000-4000-8000-000000000001",
        correlationId: "correlation-test",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE", status: 409 });

    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
