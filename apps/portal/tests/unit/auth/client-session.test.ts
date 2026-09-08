import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import { signOutClientSession } from "@/lib/auth/client-session";
import { M1ContractError } from "@/lib/contracts/m1";

describe("Client session continuity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ role: "CLIENT" });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs out only the current Client session", async () => {
    await signOutClientSession();

    expect(mocks.requireRole).toHaveBeenCalledWith("CLIENT");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not sign out a session outside the Client authorization boundary", async () => {
    mocks.requireRole.mockRejectedValue(
      new M1ContractError("FORBIDDEN", "Role is not permitted", 403),
    );

    await expect(signOutClientSession()).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("replaces an Auth provider failure with a safe contract error", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "provider internals" } });

    await expect(signOutClientSession()).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
      message: "Unable to sign out the client session",
      status: 503,
    });
  });
});
