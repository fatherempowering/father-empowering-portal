import { beforeEach, describe, expect, it, vi } from "vitest";
import { newProgram } from "@/lib/training/program-editor";
import { M1ContractError } from "@/lib/contracts/m1";
const mocks=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/auth/actor",()=>({requireCoachVerified:mocks.auth}));vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>mocks}));
import { getProgramDraft, listProgramDrafts, programRepositoryError, saveProgramDraft } from "@/lib/training/program-repository";
const id="19000000-0000-4000-8000-000000000001";
describe("Program repository",()=>{
  beforeEach(()=>{vi.resetAllMocks();});
  it("authorizes before any read or write",async()=>{mocks.auth.mockRejectedValue(new M1ContractError("FORBIDDEN","Denied",403));await expect(getProgramDraft(id)).rejects.toThrow("Denied");await expect(listProgramDrafts(0)).rejects.toThrow("Denied");await expect(saveProgramDraft({id:null,expectedVersion:0,clientMutationId:id,document:newProgram()})).rejects.toThrow("Denied");expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();});
  it("uses session-bound RPC without accepting a target owner or organization",async()=>{mocks.auth.mockResolvedValue({});mocks.rpc.mockResolvedValue({error:{message:"FE_VERSION_CONFLICT"}});const input={id:null,expectedVersion:0,clientMutationId:id,document:newProgram()};await expect(saveProgramDraft(input)).rejects.toMatchObject({status:409});expect(mocks.rpc).toHaveBeenCalledWith("save_training_program_draft",{p_program_id:null,p_document:input.document,p_expected_version:0,p_idempotency_key:id});});
  it("scopes reads and maps absence to 404",async()=>{mocks.auth.mockResolvedValue({organizationId:id});const query=Object.assign(Promise.resolve({data:null,error:null}),{select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockReturnThis()});mocks.from.mockReturnValue(query);await expect(getProgramDraft(id)).rejects.toMatchObject({status:404});expect(query.eq).toHaveBeenCalledWith("organization_id",id);expect(query.eq).toHaveBeenCalledWith("id",id);});
  it("redacts SQL exceptions and maps only exact error codes",()=>{expect(programRepositoryError({message:"FE_INVALID_TRAINING_DRAFT"}).status).toBe(400);expect(programRepositoryError({message:"secret FE_NOT_FOUND"}).status).toBe(503);expect(programRepositoryError({message:"secret"}).message).not.toContain("secret");});
});
