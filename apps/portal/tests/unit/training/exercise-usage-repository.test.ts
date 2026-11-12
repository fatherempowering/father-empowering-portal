import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireCoachVerified: vi.fn() }));
const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => auth);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => client }));
import { readOwnExerciseUsage } from "@/lib/training/exercise-usage.server";

function result(data: unknown[] | null, error: unknown = null) {
  return Object.assign(Promise.resolve({ data, error }), { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis() });
}
describe("usage ranking privacy and bounded fallback", () => {
  beforeEach(() => { vi.resetAllMocks(); auth.requireCoachVerified.mockResolvedValue({ organizationId: "org", userId: "coach" }); });
  it("requires staff authorization before querying usage", async () => {
    auth.requireCoachVerified.mockRejectedValue(new Error("Denied"));
    await expect(readOwnExerciseUsage()).rejects.toThrow("Denied");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("scopes saved drafts to the organization and current coach even for administrators", async () => {
    auth.requireCoachVerified.mockResolvedValue({ organizationId: "org", userId: "coach", role: "ADMIN" });
    const query = result([]); client.from.mockReturnValue(query);
    expect(await readOwnExerciseUsage()).toEqual({ counts: {}, available: true });
    expect(client.from).toHaveBeenCalledWith("training_program_drafts");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(query.eq).toHaveBeenCalledWith("created_by", "coach");
    expect(query.range).toHaveBeenCalledWith(0, 49);
  });
  it("returns explicit unavailable status without leaking errors or fabricated partial counts", async () => {
    client.from.mockReturnValue(result(null, { message: "secret" }));
    expect(await readOwnExerciseUsage()).toEqual({ counts: {}, available: false });
  });
  it("bounds large histories and rejects partial-count ranking", async () => {
    client.from.mockReturnValue(result(Array.from({ length: 50 }, () => ({ document: {} }))));
    expect(await readOwnExerciseUsage()).toEqual({ counts: {}, available: false });
    expect(client.from).toHaveBeenCalledTimes(4);
  });
});
