import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";
import { newProgram } from "@/lib/training/program-editor";
const repo=vi.hoisted(()=>({getProgramDraft:vi.fn(),listProgramDrafts:vi.fn(),saveProgramDraft:vi.fn()}));
vi.mock("@/lib/training/program-repository",()=>repo);
import {getProgramHttp,listProgramsHttp,saveProgramHttp} from "@/features/training/server/program-http";
const id="19000000-0000-4000-8000-000000000001";
const command=()=>({id:null,expectedVersion:0,clientMutationId:id,document:newProgram()});
const request=(origin:string|null="https://preview.example",body:unknown=command())=>new Request("http://internal:3000/api/v1/coach/programs",{method:"POST",headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
describe("Program HTTP boundary",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_APP_URL","https://preview.example");repo.listProgramDrafts.mockResolvedValue({items:[]});repo.saveProgramDraft.mockResolvedValue({id});repo.getProgramDraft.mockResolvedValue({id});});
  afterEach(()=>vi.unstubAllEnvs());
  it("lists and reads only through the guarded repository",async()=>{
    const r=await listProgramsHttp(new Request("https://preview.example/api/v1/coach/programs?page=2"));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toContain("no-store");expect(repo.listProgramDrafts).toHaveBeenCalledWith(2);
    expect((await getProgramHttp(new Request("https://preview.example"),{params:Promise.resolve({programId:id})})).status).toBe(200);expect(repo.getProgramDraft).toHaveBeenCalledWith(id);
  });
  it.each([null,"null","https://evil.example","http://preview.example","https://preview.example:444"])("denies foreign or absent origin %s",async(origin)=>{expect((await saveProgramHttp(request(origin))).status).toBe(403);expect(repo.saveProgramDraft).not.toHaveBeenCalled();});
  it("fails closed when origin configuration is absent",async()=>{vi.stubEnv("NEXT_PUBLIC_APP_URL","");expect((await saveProgramHttp(request())).status).toBe(403);});
  it("accepts canonical origin despite the internal host",async()=>{const c=command();expect((await saveProgramHttp(request(undefined,c))).status).toBe(200);expect(repo.saveProgramDraft).toHaveBeenCalledWith(c);});
  it("rejects unknown fields, malformed IDs, query injection and excessive bodies",async()=>{
    expect((await saveProgramHttp(request(undefined,{...command(),organizationId:id}))).status).toBe(400);
    expect((await saveProgramHttp(request(undefined,{padding:"x".repeat(600001)}))).status).toBe(400);
    expect((await getProgramHttp(new Request("https://preview.example"),{params:Promise.resolve({programId:"bad"})})).status).toBe(400);
    expect((await listProgramsHttp(new Request("https://preview.example/api/v1/coach/programs?owner=forged"))).status).toBe(400);
    expect(repo.saveProgramDraft).not.toHaveBeenCalled();
  });
  it.each([401,403,404,409])("preserves security/conflict response %i",async(status)=>{repo.saveProgramDraft.mockRejectedValue(new M1ContractError("FORBIDDEN","Denied",status));expect((await saveProgramHttp(request())).status).toBe(status);});
  it("never leaks unexpected server details",async()=>{repo.saveProgramDraft.mockRejectedValue(new Error("PRIVATE_SQL_VALUE"));const r=await saveProgramHttp(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("PRIVATE_SQL_VALUE");});
});
