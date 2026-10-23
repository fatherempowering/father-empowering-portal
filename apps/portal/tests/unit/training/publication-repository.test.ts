import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), own: vi.fn(), personal: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.auth }));
vi.mock("@/lib/auth/own-client-access", () => ({ requireOwnClientAccess: mocks.own, getStaffPersonalProfile: mocks.personal }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async() => mocks }));
import { listTrainingRecipients, publicationError, publishProgram, readCoachPublication, readOwnPublication } from "@/lib/training/publication-repository";
const id = "19100000-0000-4000-8000-000000000001";
const input = {clientId:id,programId:id,draftVersion:1,expectedPublicationId:null,clientMutationId:id};
describe("publication repository", () => {
  beforeEach(() => vi.resetAllMocks());
  it("authorizes before reading or publishing", async() => {
    mocks.auth.mockRejectedValue(new Error("DENIED")); mocks.own.mockRejectedValue(new Error("DENIED")); mocks.personal.mockRejectedValue(new Error("DENIED"));
    await expect(listTrainingRecipients(0)).rejects.toThrow("DENIED"); await expect(readCoachPublication(id)).rejects.toThrow("DENIED");
    await expect(publishProgram(input)).rejects.toThrow("DENIED"); await expect(readOwnPublication()).rejects.toThrow("DENIED");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses a session-bound RPC and never passes actor or document", async() => {
    mocks.auth.mockResolvedValue({}); mocks.rpc.mockResolvedValue({error:{message:"FE_VERSION_CONFLICT"}});
    await expect(publishProgram(input)).rejects.toMatchObject({status:409});
    expect(mocks.rpc).toHaveBeenCalledWith("publish_training_program",{p_client_id:id,p_program_id:id,p_draft_version:1,p_expected_publication_id:null,p_idempotency_key:id});
  });
  it("marks only the authenticated personal profile, not another recipient with the same name", async() => {
    const otherId = "19100000-0000-4000-8000-000000000002";
    mocks.personal.mockResolvedValue({profile:{id,status:"ACTIVE"}});
    mocks.rpc.mockResolvedValue({data:{clients:[{id:otherId,name:"Maxime Bourdon"},{id,name:"Maxime Bourdon"}],total:2,page:0},error:null});
    expect(await listTrainingRecipients(0)).toEqual({clients:[{id:otherId,name:"Maxime Bourdon",isOwnProfile:false},{id,name:"Maxime Bourdon",isOwnProfile:true}],total:2,page:0});
    expect(mocks.rpc).toHaveBeenCalledWith("list_training_recipients",{p_page:0});
  });
  it("never inserts a personal profile excluded from the authorized recipients", async() => {
    mocks.personal.mockResolvedValue({profile:{id,status:"ACTIVE"}});
    mocks.rpc.mockResolvedValue({data:{clients:[],total:0,page:0},error:null});
    expect(await listTrainingRecipients(0)).toEqual({clients:[],total:0,page:0});
  });
  it("does not infer ownership from a name when no personal profile exists", async() => {
    mocks.personal.mockResolvedValue({profile:null});
    mocks.rpc.mockResolvedValue({data:{clients:[{id,name:"Maxime Bourdon"}],total:1,page:0},error:null});
    expect((await listTrainingRecipients(0)).clients[0].isOwnProfile).toBe(false);
  });
  it("filters Client read by their server-resolved profile and organization", async() => {
    mocks.own.mockResolvedValue({organizationId:"org",ownClientId:id});
    const q = Object.assign(Promise.resolve({data:null,error:null}),{select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockReturnThis()}); mocks.from.mockReturnValue(q);
    expect(await readOwnPublication()).toBeNull(); expect(q.eq).toHaveBeenCalledWith("client_id",id); expect(q.eq).toHaveBeenCalledWith("organization_id","org"); expect(q.order).toHaveBeenCalledWith("revision",{ascending:false});
  });
  it("maps only exact safe database errors", () => {
    expect(publicationError({message:"FE_ALREADY_PUBLISHED"}).status).toBe(409);
    expect(publicationError({message:"FE_INVALID_TRAINING_PUBLICATION"}).status).toBe(400);
    expect(publicationError({message:"private FE_NOT_FOUND"}).status).toBe(503);
  });
  it("distinguishes empty history from lost publication access", async() => {
    mocks.auth.mockResolvedValue({}); mocks.rpc.mockResolvedValueOnce({data:{program:null},error:null});
    expect(await readCoachPublication(id)).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("get_training_publication_for_coach",{p_client_id:id});
    mocks.rpc.mockResolvedValueOnce({error:{message:"FE_NOT_FOUND"}});
    await expect(readCoachPublication(id)).rejects.toMatchObject({status:404});
  });
});
