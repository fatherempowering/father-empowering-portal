import {beforeEach,describe,expect,it,vi} from "vitest";
import {M1ContractError} from "@/lib/contracts/m1";
const mocks=vi.hoisted(()=>({auth:vi.fn(),own:vi.fn(),rpc:vi.fn(),publication:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/actor",()=>({requireCoachVerified:mocks.auth}));
vi.mock("@/lib/auth/own-client-access",()=>({requireOwnClientAccess:mocks.own}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>mocks}));
vi.mock("@/lib/training/publication-repository",()=>({readCoachPublication:mocks.publication}));
import {listOwnWorkouts,listCoachWorkouts,readOwnWorkout,readCoachWorkout,saveOwnWorkout,workoutError} from "@/lib/training/workout-repository";
const id="19100000-0000-4000-8000-000000000001";
const selector={publicationId:id,weekNumber:1,sessionId:id};
const command={...selector,expectedVersion:0,clientMutationId:id,status:"IN_PROGRESS" as const,sets:[],note:""};
describe("workout repository",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("authorizes before every database operation",async()=>{
    mocks.auth.mockRejectedValue(new Error("DENIED"));mocks.own.mockRejectedValue(new Error("DENIED"));
    await expect(listOwnWorkouts(0)).rejects.toThrow("DENIED");await expect(listCoachWorkouts(id,0)).rejects.toThrow("DENIED");
    await expect(readOwnWorkout(selector)).rejects.toThrow("DENIED");await expect(saveOwnWorkout(command)).rejects.toThrow("DENIED");
    await expect(readCoachWorkout(id,selector)).rejects.toThrow("DENIED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rechecks Coach assignment before a detail read",async()=>{
    mocks.auth.mockResolvedValue({});mocks.publication.mockRejectedValue(new M1ContractError("NOT_FOUND","Not found",404));
    await expect(readCoachWorkout(id,selector)).rejects.toMatchObject({status:404});expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses caller-bound RPC without a Client or actor id for writes",async()=>{
    mocks.own.mockResolvedValue({ownClientId:id});mocks.rpc.mockResolvedValue({error:{message:"FE_VERSION_CONFLICT"}});
    await expect(saveOwnWorkout(command)).rejects.toMatchObject({status:409});
    expect(mocks.rpc).toHaveBeenCalledWith("save_training_session_result",{p_publication_id:id,p_week_number:1,p_session_id:id,p_expected_version:0,p_idempotency_key:id,p_status:"IN_PROGRESS",p_sets:[],p_note:""});
  });
  it("resolves own history in SQL, validates Coach target after verified guard",async()=>{
    mocks.own.mockResolvedValue({ownClientId:id});mocks.auth.mockResolvedValue({});
    mocks.rpc.mockResolvedValue({data:{items:[],total:0,page:0,pageSize:20},error:null});
    await listOwnWorkouts(0);expect(mocks.rpc).toHaveBeenLastCalledWith("list_training_session_results",{p_client_id:null,p_page:0});
    await listCoachWorkouts(id,0);expect(mocks.rpc).toHaveBeenLastCalledWith("list_training_session_results",{p_client_id:id,p_page:0});
  });
  it("never turns unavailable or forbidden data into an empty history",async()=>{
    mocks.own.mockResolvedValue({});mocks.rpc.mockResolvedValue({error:{message:"FE_NOT_FOUND"}});
    await expect(readOwnWorkout(selector)).rejects.toMatchObject({status:404});
    mocks.rpc.mockResolvedValue({data:{items:[]},error:null});await expect(listOwnWorkouts(0)).rejects.toThrow();
  });
  it("maps exact allowlisted database markers only",()=>{
    expect(workoutError({message:"FE_INVALID_WORKOUT"}).status).toBe(400);
    expect(workoutError({message:"FE_WORKOUT_COMPLETED"}).status).toBe(409);
    expect(workoutError({message:"FE_SUPERSEDED_PUBLICATION"}).status).toBe(409);
    expect(workoutError({message:"FE_NOT_FOUND private note"}).status).toBe(503);
  });
});
