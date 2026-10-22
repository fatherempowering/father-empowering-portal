import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const repo = vi.hoisted(()=>({listOwnWorkouts:vi.fn(),listCoachWorkouts:vi.fn(),readOwnWorkout:vi.fn(),readCoachWorkout:vi.fn(),saveOwnWorkout:vi.fn()}));
vi.mock("@/lib/training/workout-repository",()=>repo);
import {clientWorkoutsHttp,clientWorkoutHttp,saveWorkoutHttp,coachWorkoutsHttp,coachWorkoutHttp} from "@/features/training/server/workout-http";
const id="19100000-0000-4000-8000-000000000001";
const command={publicationId:id,weekNumber:1,sessionId:id,expectedVersion:0,clientMutationId:id,status:"IN_PROGRESS",sets:[],note:""};
const request=(origin:string|null="https://preview.example",body:unknown=command)=>new Request("http://internal:3000",{method:"POST",headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
describe("workout HTTP boundary",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_APP_URL","https://preview.example");repo.listOwnWorkouts.mockResolvedValue({items:[],total:0,page:0,pageSize:20});});
  afterEach(()=>vi.unstubAllEnvs());
  it.each([null,"null","https://evil.example","http://preview.example","https://preview.example:444"])("denies origin %s",async origin=>{
    expect((await saveWorkoutHttp(request(origin))).status).toBe(403);expect(repo.saveOwnWorkout).not.toHaveBeenCalled();
  });
  it("accepts canonical origin despite internal host, and sets private response headers",async()=>{
    const response=await saveWorkoutHttp(request());
    expect(response.status).toBe(200);expect(repo.saveOwnWorkout).toHaveBeenCalledWith(command);
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("requires canonical config",async()=>{vi.stubEnv("NEXT_PUBLIC_APP_URL","");expect((await saveWorkoutHttp(request())).status).toBe(403);});
  it.each(["clientId","actorId","organizationId"])("does not accept browser identity %s",async field=>{
    expect((await saveWorkoutHttp(request(undefined,{...command,[field]:id}))).status).toBe(400);expect(repo.saveOwnWorkout).not.toHaveBeenCalled();
  });
  it("rejects missing, malformed, too large and unknown inputs",async()=>{
    expect((await saveWorkoutHttp(request(undefined,{}))).status).toBe(400);
    expect((await saveWorkoutHttp(request(undefined,{...command,note:"x".repeat(4194305)}))).status).toBe(400);
    const malformed=new Request("http://internal",{method:"POST",headers:{Origin:"https://preview.example"} ,body:"{"});
    expect((await saveWorkoutHttp(malformed)).status).toBe(400);
    expect((await clientWorkoutHttp(new Request("http://internal?publicationId=bad&weekNumber=1&sessionId="+id))).status).toBe(400);
  });
  it("reads own history without a browser Client target",async()=>{
    const r=await clientWorkoutsHttp(new Request("http://internal?page=2"));
    expect(r.status).toBe(200);expect(repo.listOwnWorkouts).toHaveBeenCalledWith(2);
    expect((await clientWorkoutsHttp(new Request("http://internal?clientId="+id))).status).toBe(400);
    expect((await clientWorkoutsHttp(new Request("http://internal?page=-1"))).status).toBe(400);
  });
  it("validates selected session and Coach target",async()=>{
    expect((await clientWorkoutHttp(new Request(`http://internal?publicationId=${id}&weekNumber=2&sessionId=${id}`))).status).toBe(200);
    expect(repo.readOwnWorkout).toHaveBeenCalledWith({publicationId:id,weekNumber:2,sessionId:id});
    expect((await coachWorkoutsHttp(new Request("http://internal?page=1"),{params:Promise.resolve({clientId:id})})).status).toBe(200);
    expect(repo.listCoachWorkouts).toHaveBeenCalledWith(id,1);
    expect((await coachWorkoutHttp(new Request(`http://internal?publicationId=${id}&weekNumber=2&sessionId=${id}`),{params:Promise.resolve({clientId:id})})).status).toBe(200);
    expect(repo.readCoachWorkout).toHaveBeenCalledWith(id,{publicationId:id,weekNumber:2,sessionId:id});
    expect((await coachWorkoutsHttp(new Request("http://internal"),{params:Promise.resolve({clientId:"bad"})})).status).toBe(400);
  });
  it("never serializes a raw internal exception or note",async()=>{
    repo.saveOwnWorkout.mockRejectedValue(new Error("PRIVATE_WORKOUT_EXCEPTION"));
    const r=await saveWorkoutHttp(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("PRIVATE_WORKOUT_EXCEPTION");
  });
});
