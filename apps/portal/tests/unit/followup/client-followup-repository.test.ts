import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCheckInDocument, EMPTY_NUTRITION_DOCUMENT } from "@/lib/contracts/client-followup";
const mock = vi.hoisted(() => ({ coach: vi.fn(), own: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mock.coach }));
vi.mock("@/lib/auth/own-client-access", () => ({ requireOwnClientAccess: mock.own }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mock }));
import { followupError, mutateCoachNutrition, mutateOwnCheckIn, readCoachCheckIns, readCoachNutrition, readOwnCheckIns, readOwnNutrition, readOwnProgression } from "@/lib/followup/followup-repository";
const clientId = "10000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000002";
const date = "2026-01-01T12:00:00Z";
function query(result: unknown) {
  return Object.assign(Promise.resolve(result), { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis() });
}
describe("Follow-up repository capabilities and truthful reads", () => {
  beforeEach(() => { vi.resetAllMocks(); mock.coach.mockResolvedValue({ organizationId }); mock.own.mockResolvedValue({ organizationId, ownClientId: clientId }); });
  it("authenticates every surface before accessing the database", async () => {
    mock.coach.mockRejectedValue(new Error("DENIED")); mock.own.mockRejectedValue(new Error("DENIED"));
    for (const read of [() => readCoachNutrition(clientId), () => readCoachCheckIns(clientId), readOwnNutrition, readOwnCheckIns, readOwnProgression,
      () => mutateOwnCheckIn({ action: "submit", expectedVersion: 1, clientMutationId: clientId }),
      () => mutateCoachNutrition(clientId, { action: "save", expectedVersion: 0, clientMutationId: clientId, document: EMPTY_NUTRITION_DOCUMENT })]) await expect(read()).rejects.toThrow("DENIED");
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("loads only published own nutrition and keeps draft tables out of the Client read", async () => {
    const q = query({ data: [], error: null, count: 0 }); mock.from.mockReturnValue(q);
    expect(await readOwnNutrition()).toEqual({ publication: null, history: [], historyTruncated: false });
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("nutrition_plan_publications");
    expect(q.eq).toHaveBeenCalledWith("client_id", clientId); expect(q.eq).toHaveBeenCalledWith("organization_id", organizationId);
  });
  it("keeps monotone draft version after submission and paginates rather than silently truncating", async () => {
    const draft = query({ data: { active: false, row_version: 4, document: emptyCheckInDocument("2026-01-01"), updated_at: date }, error: null });
    const count = query({ data: null, error: null, count: 101 });
    const history = query({ data: [], error: null }); mock.from.mockReturnValueOnce(draft).mockReturnValueOnce(count).mockReturnValueOnce(history);
    expect(await readOwnCheckIns(1)).toEqual({ draft: null, version: 4, history: [], historyTruncated: true, page: 1, total: 101 });
    expect(history.range).toHaveBeenCalledWith(50, 99); expect(history.order).toHaveBeenCalledWith("observed_on", { ascending: false });
    expect(count.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(history.select).toHaveBeenCalledWith("id,client_id,document,submitted_at");
    for (const source of [draft, count, history]) {
      expect(source.eq).toHaveBeenCalledWith("client_id", clientId);
      expect(source.eq).toHaveBeenCalledWith("organization_id", organizationId);
    }
  });
  it.each([{ total: 0, page: 0 }, { total: 1, page: 1 }, { total: 50, page: 1 }])("returns an empty page without an out-of-bounds request: $total rows / page $page", async ({ total, page }) => {
    const draft = query({ data: null, error: null }); const count = query({ data: null, error: null, count: total });
    mock.from.mockReturnValueOnce(draft).mockReturnValueOnce(count);
    expect(await readOwnCheckIns(page)).toEqual({ draft: null, version: 0, history: [], historyTruncated: false, page, total });
    expect(mock.from).toHaveBeenCalledTimes(2); expect(count.range).not.toHaveBeenCalled();
    expect(count.eq).toHaveBeenCalledWith("client_id", clientId); expect(count.eq).toHaveBeenCalledWith("organization_id", organizationId);
  });
  it.each([null, -1, 1.5, Number.NaN])("never invents an empty history when the count is invalid: %s", async countValue => {
    mock.from.mockReturnValueOnce(query({ data: null, error: null })).mockReturnValueOnce(query({ count: countValue, error: null }));
    await expect(readOwnCheckIns(1)).rejects.toMatchObject({ status: 503 });
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
  it.each(["draft", "count", "history"])("keeps a %s read failure fail-closed and sanitized", async failedSource => {
    const failure = { message: "PRIVATE_PROVIDER_DETAIL" };
    mock.from.mockReturnValueOnce(query({ data: null, error: failedSource === "draft" ? failure : null }))
      .mockReturnValueOnce(query({ count: 51, error: failedSource === "count" ? failure : null }))
      .mockReturnValueOnce(query({ data: null, error: failure }));
    await expect(readOwnCheckIns(1)).rejects.toMatchObject({ status: 503, message: "Follow-up is temporarily unavailable." });
    expect(mock.from).toHaveBeenCalledTimes(failedSource === "history" ? 3 : 2);
  });
  it("uses a guarded Coach RPC to distinguish inaccessible Client from empty history", async () => {
    mock.rpc.mockResolvedValueOnce({ data: { draft: null, publication: null, history: [], historyTruncated: false }, error: null });
    expect((await readCoachNutrition(clientId)).publication).toBeNull();
    mock.rpc.mockResolvedValueOnce({ error: { message: "FE_NOT_FOUND" } });
    await expect(readCoachNutrition(clientId)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mock.rpc).toHaveBeenCalledWith("get_followup_for_coach", { p_client_id: clientId, p_kind: "nutrition", p_page: 0 });
  });
  it("never accepts a caller-supplied Client identity in the session-bound Client RPC", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "FE_VERSION_CONFLICT" } });
    const input = { action: "submit" as const, expectedVersion: 1, clientMutationId: clientId };
    await expect(mutateOwnCheckIn(input)).rejects.toMatchObject({ status: 409 });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("mutate_own_checkin", { p_input: input });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("counts only actual completed workouts and reports bounded real dates", async () => {
    const wz = query({ data: null, error: null }); const checkins = query({ data: [], error: null, count: 201 });
    const workouts = query({ data: [{ completed_at: date }], error: null, count: 201 });
    mock.from.mockReturnValueOnce(wz).mockReturnValueOnce(checkins).mockReturnValueOnce(workouts);
    const result = await readOwnProgression();
    expect(result.completedWorkouts).toEqual({ total: 201, dates: [date], datesTruncated: true });
    expect(result.checkInsTruncated).toBe(true); expect(result.baseline).toBeNull();
    expect(workouts.eq).toHaveBeenCalledWith("status", "COMPLETED"); expect(workouts.not).toHaveBeenCalledWith("completed_at", "is", null);
    expect(wz.eq).toHaveBeenCalledWith("status", "SUBMITTED");
    for (const source of [wz, checkins, workouts]) {
      expect(source.eq).toHaveBeenCalledWith("client_id", clientId);
      expect(source.eq).toHaveBeenCalledWith("organization_id", organizationId);
    }
    expect(workouts.order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(workouts.select).toHaveBeenCalledWith("completed_at", { count: "exact" });
  });
  it("does not claim zero when exact counts or any source are unavailable", async () => {
    mock.from.mockReturnValue(query({ data: [], error: null, count: null }));
    await expect(readOwnNutrition()).rejects.toMatchObject({ status: 503 });
    mock.from.mockReturnValue(query({ data: [], error: { message: "PRIVATE_DETAIL" }, count: 0 }));
    await expect(readOwnProgression()).rejects.toMatchObject({ status: 503 });
  });
  it("maps only allowlisted database errors without disclosing provider details", () => {
    expect(followupError({ message: "FE_IDEMPOTENCY_CONFLICT" })).toMatchObject({ status: 409, code: "DUPLICATE" });
    expect(followupError({ message: "FE_CHECKIN_INCOMPLETE" })).toMatchObject({ status: 400 });
    expect(followupError({ message: "private FE_NOT_FOUND medical payload" })).toMatchObject({ status: 503, message: "Follow-up is temporarily unavailable." });
  });
  it("retains Nutrition history but never resurrects a prior plan after withdrawal", async () => {
    const oldId="10000000-0000-4000-8000-000000000003";
    const row=(id:string,revision:number)=>({id,client_id:clientId,revision,draft_version:revision,document:EMPTY_NUTRITION_DOCUMENT,published_at:date});
    const history=query({data:[row(clientId,2),row(oldId,1)],error:null,count:2});
    const retired=query({data:[{publication_id:clientId,withdrawn_at:date}],error:null});
    mock.from.mockReturnValueOnce(history).mockReturnValueOnce(retired);
    const actual=await readOwnNutrition();
    expect(actual.publication).toBeNull(); expect(actual.history.map(p=>[p.id,p.withdrawnAt])).toEqual([[clientId,date],[oldId,null]]);
    expect(retired.in).toHaveBeenCalledWith("publication_id",[clientId,oldId]);
    expect(history.eq).toHaveBeenCalledWith("client_id",clientId); expect(history.eq).toHaveBeenCalledWith("organization_id",organizationId);
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
  it("withdrawal replays re-read current Nutrition without trusting an old receipt", async () => {
    const input={action:"withdraw" as const,expectedPublicationId:clientId,clientMutationId:clientId};
    mock.rpc.mockResolvedValueOnce({data:{publicationId:clientId},error:null})
      .mockResolvedValueOnce({data:{draft:null,publication:null,history:[],historyTruncated:false},error:null});
    expect((await mutateCoachNutrition(clientId,input)).publication).toBeNull();
    expect(mock.rpc).toHaveBeenNthCalledWith(1,"mutate_coach_nutrition",{p_client_id:clientId,p_input:input});
    expect(mock.rpc).toHaveBeenNthCalledWith(2,"get_followup_for_coach",{p_client_id:clientId,p_kind:"nutrition",p_page:0});
  });
});
