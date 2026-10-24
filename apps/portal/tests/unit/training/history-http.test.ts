import { beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";
const repo = vi.hoisted(() => ({ listProgramHistory: vi.fn(), getProgramHistoryVersion: vi.fn() }));
vi.mock("@/lib/training/history-repository", () => repo);
import { getHistoryVersionHttp, listHistoryHttp } from "@/features/training/server/history-http";
const id = "19000000-0000-4000-8000-000000000001";
const request = (query = "") => new Request(`https://preview.example/api/v1/coach/programs/${id}/history${query}`);
describe("Draft history HTTP", () => {
  beforeEach(() => { vi.resetAllMocks(); repo.listProgramHistory.mockResolvedValue({ items: [] }); repo.getProgramHistoryVersion.mockResolvedValue({ id }); });
  it("reads paginated metadata and a selected version without caching", async () => {
    const list = await listHistoryHttp(request("?page=2"), { params: Promise.resolve({ programId: id }) });
    expect(list.status).toBe(200); expect(list.headers.get("cache-control")).toContain("no-store"); expect(repo.listProgramHistory).toHaveBeenCalledWith(id, 2);
    const item = await getHistoryVersionHttp(request(), { params: Promise.resolve({ programId: id, version: "3" }) });
    expect(item.status).toBe(200); expect(item.headers.get("referrer-policy")).toBe("no-referrer"); expect(repo.getProgramHistoryVersion).toHaveBeenCalledWith(id, 3);
  });
  it.each(["?page=-1", "?page=10001", "?owner=forged"])("rejects query %s", async (query) => {
    expect((await listHistoryHttp(request(query), { params: Promise.resolve({ programId: id }) })).status).toBe(400); expect(repo.listProgramHistory).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.2", "Infinity", "bad"])("rejects version %s", async (version) => {
    expect((await getHistoryVersionHttp(request(), { params: Promise.resolve({ programId: id, version }) })).status).toBe(400); expect(repo.getProgramHistoryVersion).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("preserves current authorization denial %i", async (status) => {
    repo.listProgramHistory.mockRejectedValue(new M1ContractError("FORBIDDEN", "Denied", status));
    expect((await listHistoryHttp(request(), { params: Promise.resolve({ programId: id }) })).status).toBe(status);
  });
  it("rejects malformed identity and suppresses unexpected details", async () => {
    expect((await listHistoryHttp(request(), { params: Promise.resolve({ programId: "bad" }) })).status).toBe(400); expect(repo.listProgramHistory).not.toHaveBeenCalled();
    repo.getProgramHistoryVersion.mockRejectedValue(new Error("PRIVATE_TOKEN"));
    const result = await getHistoryVersionHttp(request(), { params: Promise.resolve({ programId: id, version: "1" }) }); expect(result.status).toBe(503); expect(await result.text()).not.toContain("PRIVATE_TOKEN");
  });
});
