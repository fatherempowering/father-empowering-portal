import * as React from "react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {M1ContractError} from "@/lib/contracts/m1";
const mocks=vi.hoisted(()=>({actor:vi.fn(),verified:vi.fn(),redirect:vi.fn(),results:vi.fn()}));
vi.mock("@/lib/auth/actor",()=>({getServerActor:mocks.actor,requireCoachVerified:mocks.verified}));
vi.mock("@/features/training/coach/workout-results",()=>({CoachWorkoutResults:mocks.results}));
vi.mock("next/navigation",()=>({redirect:(destination:string)=>{mocks.redirect(destination);throw new Error("NEXT_REDIRECT");}}));
import CoachWorkoutPage from "@/app/(coach)/coach/clients/[clientId]/workouts/page";
const id="19100000-0000-4000-8000-000000000001";
const props={params:Promise.resolve({clientId:id})};
describe("Coach workout page guard",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("React",React);mocks.actor.mockResolvedValue({role:"COACH"});});
  afterEach(()=>vi.unstubAllGlobals());
  it("renders only after verified Coach guard",async()=>{const page=await CoachWorkoutPage(props);expect(page.type).toBe(mocks.results);expect(page.props.clientId).toBe(id);expect(mocks.verified).toHaveBeenCalledOnce();});
  it.each([[null,"/login"],[{role:"CLIENT"},"/client"]])("redirects unauthorized actor %j",async(actor,path)=>{
    mocks.actor.mockResolvedValue(actor);await expect(CoachWorkoutPage(props)).rejects.toThrow("NEXT_REDIRECT");expect(mocks.redirect).toHaveBeenCalledWith(path);expect(mocks.verified).not.toHaveBeenCalled();
  });
  it.each([["FORBIDDEN",403,"/verify-email"],["UNAUTHENTICATED",401,"/login"]] as const)("handles %s safely",async(code,status,path)=>{
    mocks.verified.mockRejectedValue(new M1ContractError(code,"Denied",status));await expect(CoachWorkoutPage(props)).rejects.toThrow("NEXT_REDIRECT");expect(mocks.redirect).toHaveBeenCalledWith(path);
  });
  it("does not render during outage or invalid target",async()=>{
    mocks.verified.mockRejectedValueOnce(new Error("OUTAGE"));await expect(CoachWorkoutPage(props)).rejects.toThrow("OUTAGE");
    await expect(CoachWorkoutPage({params:Promise.resolve({clientId:"bad"})})).rejects.toThrow("NEXT_REDIRECT");expect(mocks.redirect).toHaveBeenCalledWith("/coach");
  });
});
