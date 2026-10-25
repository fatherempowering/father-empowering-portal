import { beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";
import { EMPTY_NUTRITION_DOCUMENT, emptyCheckInDocument } from "@/lib/contracts/client-followup";
const repository = vi.hoisted(() => ({ mutateCoachNutrition: vi.fn(), mutateOwnCheckIn: vi.fn(), readCoachCheckIns: vi.fn(), readCoachNutrition: vi.fn(), readOwnCheckIns: vi.fn(), readOwnNutrition: vi.fn(), readOwnProgression: vi.fn() }));
const origin = vi.hoisted(() => ({ requireSameOrigin: vi.fn() }));
vi.mock("@/lib/followup/followup-repository", () => repository);
vi.mock("@/lib/http/origin", () => origin);
import { getOwnCheckInsHttp, getOwnNutritionHttp, getOwnProgressionHttp, getCoachNutritionHttp, getCoachCheckInsHttp, mutateOwnCheckInHttp, mutateCoachNutritionHttp } from "@/features/followup/server/http";
const id = "10000000-0000-4000-8000-000000000001";
function request(body: unknown) { return new Request("https://example.test/api", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(body) }); }
describe("Follow-up HTTP boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); for (const method of Object.values(repository)) method.mockResolvedValue({ marker: "validated repository result" }); });
  it("returns no-store direct data envelopes for every read", async () => {
    for (const response of await Promise.all([getOwnNutritionHttp(), getOwnProgressionHttp(), getOwnCheckInsHttp(new Request("https://example.test/api?page=2")), getCoachNutritionHttp(id), getCoachCheckInsHttp(new Request("https://example.test/api?page=1"), id)])) {
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ data: { marker: "validated repository result" } });
    }
    expect(repository.readOwnCheckIns).toHaveBeenCalledWith(2); expect(repository.readCoachCheckIns).toHaveBeenCalledWith(id, 1);
  });
  it("preserves exact authorized save envelopes and checks same-origin before mutation", async () => {
    const input = { action: "save", document: emptyCheckInDocument("2026-01-01"), expectedVersion: 0, clientMutationId: id };
    expect((await mutateOwnCheckInHttp(request(input))).status).toBe(200);
    expect(repository.mutateOwnCheckIn).toHaveBeenCalledWith(input); expect(origin.requireSameOrigin).toHaveBeenCalledTimes(1);
    expect((await mutateCoachNutritionHttp(request({ ...input, document: EMPTY_NUTRITION_DOCUMENT }), id)).status).toBe(200);
    expect(origin.requireSameOrigin).toHaveBeenCalledTimes(2);
  });
  it("rejects origin failure, forged identity and oversized input before repository mutation", async () => {
    origin.requireSameOrigin.mockImplementationOnce(() => { throw new M1ContractError("FORBIDDEN", "Cross-origin mutation denied", 403); });
    expect((await mutateOwnCheckInHttp(request({}))).status).toBe(403);
    expect((await mutateOwnCheckInHttp(request({ action: "submit", expectedVersion: 1, clientMutationId: id, clientId: id }))).status).toBe(400);
    expect((await mutateOwnCheckInHttp(request({ text: "x".repeat(30_000) }))).status).toBe(400);
    expect(repository.mutateOwnCheckIn).not.toHaveBeenCalled();
  });
  it("rejects malformed pagination without silently fetching page zero", async () => {
    for (const page of ["-1", "1.5", "01", "10001", "no"]) expect((await getOwnCheckInsHttp(new Request(`https://example.test/api?page=${page}`))).status).toBe(400);
    expect(repository.readOwnCheckIns).not.toHaveBeenCalled();
  });
  it("does not convert access denial or stale writes into empty successful pages", async () => {
    repository.readCoachNutrition.mockRejectedValue(new M1ContractError("NOT_FOUND", "Client follow-up is unavailable", 404));
    expect((await getCoachNutritionHttp(id)).status).toBe(404);
    repository.mutateOwnCheckIn.mockRejectedValue(new M1ContractError("VERSION_CONFLICT", "Reload", 409));
    expect((await mutateOwnCheckInHttp(request({ action: "submit", expectedVersion: 1, clientMutationId: id }))).status).toBe(409);
  });
  it("never discloses raw provider errors or health payloads", async () => {
    repository.readOwnProgression.mockRejectedValue(new Error("SECRET_PROVIDER_PAYLOAD"));
    const response = await getOwnProgressionHttp(); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET_PROVIDER_PAYLOAD");
  });
});
