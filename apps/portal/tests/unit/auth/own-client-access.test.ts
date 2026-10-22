import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), verified: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), one: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireActor: mocks.actor, requireCoachVerified: mocks.verified }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { getStaffPersonalProfile, requireOwnClientAccess } from "@/lib/auth/own-client-access";
import { M1ContractError } from "@/lib/contracts/m1";

const staff = { userId: "owner", organizationId: "org", role: "ADMIN", clientId: null };
describe("Own Client data capability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.one };
    mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
    mocks.actor.mockResolvedValue(staff); mocks.verified.mockResolvedValue(staff);
    mocks.one.mockResolvedValue({ data: { id: "personal", status: "ACTIVE" }, error: null });
  });
  it("preserves a Client's own identity without staff verification", async () => {
    mocks.actor.mockResolvedValue({ ...staff, role: "CLIENT", clientId: "client" });
    await expect(requireOwnClientAccess()).resolves.toMatchObject({ role: "CLIENT", ownClientId: "client" });
    expect(mocks.verified).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("denies an unlinked Client", async () => {
    mocks.actor.mockResolvedValue({ ...staff, role: "CLIENT" });
    await expect(requireOwnClientAccess()).rejects.toMatchObject({ status: 403 });
  });
  it.each(["ADMIN", "COACH"])("keeps the %s role and resolves only the authenticated owner's record", async (role) => {
    mocks.actor.mockResolvedValue({ ...staff, role }); mocks.verified.mockResolvedValue({ ...staff, role });
    await expect(requireOwnClientAccess()).resolves.toEqual({ ...staff, role, ownClientId: "personal" });
    expect(mocks.verified).toHaveBeenCalledOnce();
    expect(mocks.eq.mock.calls).toEqual([["organization_id", "org"], ["auth_user_id", "owner"]]);
  });
  it.each([401, 403])("requires the existing staff session guard (%s)", async (status) => {
    mocks.verified.mockRejectedValue(new M1ContractError("FORBIDDEN", "Denied", status));
    await expect(requireOwnClientAccess()).rejects.toMatchObject({ status });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reports a missing profile without creating or linking anything", async () => {
    mocks.one.mockResolvedValue({ data: null, error: null });
    await expect(getStaffPersonalProfile()).resolves.toEqual({ actor: staff, profile: null });
    await expect(requireOwnClientAccess()).rejects.toMatchObject({ status: 404 });
  });
  it.each(["INVITED", "SUSPENDED", "ARCHIVED"])("rejects a %s own profile", async (status) => {
    mocks.one.mockResolvedValue({ data: { id: "personal", status }, error: null });
    await expect(requireOwnClientAccess()).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed and hides provider internals on lookup failure", async () => {
    mocks.one.mockResolvedValue({ data: null, error: { message: "private provider contents" } });
    await expect(requireOwnClientAccess()).rejects.toMatchObject({ status: 503, message: "Unable to load personal profile" });
  });
});
