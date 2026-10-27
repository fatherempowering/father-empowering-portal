import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const repo = vi.hoisted(() => ({ listTrainingRecipients: vi.fn(), publishProgram: vi.fn(), withdrawProgram: vi.fn(), readCoachPublication: vi.fn(), readOwnPublication: vi.fn() }));
vi.mock("@/lib/training/publication-repository", () => repo);
import { clientPublicationHttp, coachPublicationHttp, publishProgramHttp, withdrawProgramHttp, recipientsHttp } from "@/features/training/server/publication-http";
const id = "19100000-0000-4000-8000-000000000001";
const command = { clientId: id, programId: id, draftVersion: 1, expectedPublicationId: null, clientMutationId: id };
const request = (origin: string | null = "https://preview.example", body: unknown = command) => new Request("http://internal:3000", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
describe("publication HTTP", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.example"); repo.readOwnPublication.mockResolvedValue(null); });
  afterEach(() => vi.unstubAllEnvs());
  it.each([null,"null","https://evil.example","http://preview.example","https://preview.example:444"])("denies invalid origin %s", async(origin) => {
    expect((await publishProgramHttp(request(origin))).status).toBe(403); expect(repo.publishProgram).not.toHaveBeenCalled();
  });
  it("accepts only identifiers, versions and canonical origin", async() => {
    expect((await publishProgramHttp(request())).status).toBe(200); expect(repo.publishProgram).toHaveBeenCalledWith(command);
    expect((await publishProgramHttp(request(undefined,{ ...command, actorId: id }))).status).toBe(400);
  });
  it("fails closed with missing canonical config", async() => { vi.stubEnv("NEXT_PUBLIC_APP_URL", ""); expect((await publishProgramHttp(request())).status).toBe(403); });
  it("reads own publication without accepting a target Client", async() => {
    const response = await clientPublicationHttp(); expect(response.status).toBe(200); expect(await response.json()).toEqual({data:{program:null}});
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(repo.readOwnPublication).toHaveBeenCalledWith();
  });
  it("validates Coach read target and pagination", async() => {
    expect((await coachPublicationHttp(new Request("http://internal"),{params:Promise.resolve({clientId:"bad"})})).status).toBe(400);
    expect((await recipientsHttp(new Request("http://internal?page=-1"))).status).toBe(400);
    expect((await recipientsHttp(new Request("http://internal?page=2"))).status).toBe(200); expect(repo.listTrainingRecipients).toHaveBeenCalledWith(2);
  });
  it("never returns raw exceptions", async() => {
    repo.publishProgram.mockRejectedValue(new Error("PRIVATE_VALUE")); const r = await publishProgramHttp(request());
    expect(r.status).toBe(503); expect(await r.text()).not.toContain("PRIVATE_VALUE");
  });
  it("withdraws only from canonical origin with an explicit immutable publication identity", async() => {
    const context={params:Promise.resolve({clientId:id})}; const body={expectedPublicationId:id,clientMutationId:id};
    repo.withdrawProgram.mockResolvedValue(null);
    const response=await withdrawProgramHttp(request(undefined,body),context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({data:{program:null}});
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(repo.withdrawProgram).toHaveBeenCalledExactlyOnceWith(id,body);
    expect((await withdrawProgramHttp(request(null,body),context)).status).toBe(403);
    expect((await withdrawProgramHttp(request(undefined,{...body,actorId:id}),context)).status).toBe(400);
    expect((await withdrawProgramHttp(request(undefined,{...body,expectedPublicationId:null}),context)).status).toBe(400);
    expect((await withdrawProgramHttp(request(undefined,body),{params:Promise.resolve({clientId:"bad"})})).status).toBe(400);
    expect(repo.withdrawProgram).toHaveBeenCalledTimes(1);
  });
});
