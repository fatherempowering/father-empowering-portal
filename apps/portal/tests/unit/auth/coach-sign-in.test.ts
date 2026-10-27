import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signOut: vi.fn(), assurance: vi.fn(), audit: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut,
      mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/audit/staff-auth", () => ({ recordStaffAuthAudit: mocks.audit }));

import { signInCoachWithPassword } from "@/lib/auth/coach-sign-in";
import { M1ContractError } from "@/lib/contracts/m1";

const userId = "11000000-0000-4000-8000-000000000001";
const membership = {
  id: "31000000-0000-4000-8000-000000000001",
  organization_id: "21000000-0000-4000-8000-000000000001",
  role: "ADMIN", status: "ACTIVE",
};
const credentials = { email: "coach@example.test", password: "synthetic-test-password" };

describe("Coach password sign-in service failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const method of [mocks.from, mocks.select, mocks.eq, mocks.abortSignal]) method.mockReturnValue(mocks);
    mocks.signIn.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: membership, error: null });
    mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.audit.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["ADMIN", "COACH"])("keeps %s on the email verification path, never bypassing it", async (role) => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...membership, role }, error: null });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await expect(signInCoachWithPassword(credentials)).resolves.toEqual({ destination: "/verify-email" });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.eq).toHaveBeenCalledWith("status", "ACTIVE");
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId, role, aal: "aal1" }), { command: "CoachSignedIn" });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(["invalid_credentials", "email_not_confirmed", "user_banned"])("keeps %s indistinguishable from invalid credentials", async (code) => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { code, status: 400 } });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects malformed credentials before contacting Auth", async () => {
    await expect(signInCoachWithPassword({ email: "bad", password: "" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each([
    { code: "unexpected_failure", status: 503 },
    { code: "over_request_rate_limit", status: 429 },
    { status: 504 },
  ])("does not accuse the password when Auth is unavailable: %j", async (error) => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed on an incomplete Auth response", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: null });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE" });
  });

  it.each([
    { code: "PGRST003", message: "sensitive provider details" },
    { code: "", message: "TimeoutError: sensitive provider details" },
  ])("classifies membership timeout as unavailable and revokes only this session", async (error) => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE", message: "Unable to verify Coach access", status: 503,
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("sanitizes thrown network errors even when local cleanup also fails", async () => {
    mocks.maybeSingle.mockRejectedValue(new Error("private provider payload"));
    mocks.signOut.mockRejectedValue(new Error("private auth details"));
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE", message: "Unable to verify Coach access", status: 503,
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves the outage classification when cleanup returns an Auth error", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST003" } });
    mocks.signOut.mockResolvedValue({ error: { message: "private cleanup error" } });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE", message: "Unable to verify Coach access", status: 503,
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([null, { ...membership, role: "CLIENT" }])("still denies a missing/non-staff membership", async (data) => {
    mocks.maybeSingle.mockResolvedValue({ data, error: null });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps assurance verification fail-closed", async () => {
    mocks.assurance.mockResolvedValue({ data: null, error: { message: "private details" } });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not report malformed server data as a bad password", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...membership, id: "not-a-uuid" }, error: null });
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("still denies entry if the required sign-in audit fails", async () => {
    mocks.audit.mockRejectedValue(new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unable to record authentication event", 503));
    await expect(signInCoachWithPassword(credentials)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
});
