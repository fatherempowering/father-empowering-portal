import { beforeEach, describe, expect, it, vi } from "vitest";
import { newProgram } from "@/lib/training/program-editor";
import { M1ContractError } from "@/lib/contracts/m1";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({})); vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
import { getProgramHistoryVersion, listProgramHistory } from "@/lib/training/history-repository";
const id = "19000000-0000-4000-8000-000000000001";
const snapshot = () => ({ id, version: 1, createdBy: id, document: newProgram(), updatedAt: "2026-10-23T12:00:00Z" });
describe("Guarded draft history", () => {
  beforeEach(() => vi.resetAllMocks());
  it("authorizes before any history read, with no receipt table access", async () => {
    mocks.auth.mockRejectedValue(new M1ContractError("FORBIDDEN", "Denied", 403));
    await expect(listProgramHistory(id, 0)).rejects.toThrow("Denied"); await expect(getProgramHistoryVersion(id, 1)).rejects.toThrow("Denied");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses only session-bound paginated read RPC and returns metadata", async () => {
    const data = { items: [{ version: 1, updatedAt: "2026-10-23T12:00:00Z" }], total: 1, page: 0, pageSize: 20 };
    mocks.rpc.mockResolvedValue({ data, error: null }); expect(await listProgramHistory(id, 0)).toEqual(data);
    expect(mocks.rpc).toHaveBeenCalledWith("read_training_program_history", { p_program_id: id, p_version: null, p_page: 0 });
  });
  it("validates the exact requested snapshot and does not save or publish it", async () => {
    const saved = snapshot(); mocks.rpc.mockResolvedValue({ data: saved, error: null });
    expect(await getProgramHistoryVersion(id, 1)).toEqual(saved); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue({ data: { ...saved, version: 2 }, error: null }); await expect(getProgramHistoryVersion(id, 1)).rejects.toMatchObject({ status: 503 });
  });
  it("rejects invalid selectors and hides SQL details", async () => {
    await expect(getProgramHistoryVersion(id, -1)).rejects.toThrow(); await expect(listProgramHistory(id, 10001)).rejects.toThrow(); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ error: { message: "SECRET_SQL" } }); await expect(listProgramHistory(id, 0)).rejects.not.toThrow("SECRET_SQL");
  });
});
