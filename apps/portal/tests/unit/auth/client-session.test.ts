import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  signOutCoach: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/auth/coach-session", () => ({ signOutCoachSession: mocks.signOutCoach }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import { signOutClientSession } from "@/lib/auth/client-session";
import { M1ContractError } from "@/lib/contracts/m1";

describe("Client session continuity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireActor.mockResolvedValue({ role: "CLIENT" });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs out only the current Client session", async () => {
    await expect(signOutClientSession()).resolves.toBe("/client-login");

    expect(mocks.requireActor).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not sign out a session outside the active actor authorization boundary", async () => {
    mocks.requireActor.mockRejectedValue(
      new M1ContractError("FORBIDDEN", "Role is not permitted", 403),
    );

    await expect(signOutClientSession()).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.signOutCoach).not.toHaveBeenCalled();
  });

  it.each(["COACH", "ADMIN"])("uses the existing local staff logout and attestation revocation for %s", async (role) => {
    mocks.requireActor.mockResolvedValue({ role });
    await expect(signOutClientSession()).resolves.toBe("/login");
    expect(mocks.signOutCoach).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not report success when staff session revocation fails", async () => {
    mocks.requireActor.mockResolvedValue({ role: "ADMIN" });
    mocks.signOutCoach.mockRejectedValue(new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to sign out", 503));
    await expect(signOutClientSession()).rejects.toMatchObject({ status: 503 });
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
