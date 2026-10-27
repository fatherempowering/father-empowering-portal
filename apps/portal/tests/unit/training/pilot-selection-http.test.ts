import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { M1ContractError } from "@/lib/contracts/m1";
import source from "@/lib/training/pilot/source.json";
import { buildPilotProgramSnapshots } from "@/lib/training/pilot/program-snapshot";
import { pilotDefaultUnit } from "@/lib/contracts/training-pilot";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.guard }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
import { selectPilotExerciseHttp } from "@/features/training/server/exercise-pilot-selection-http";
const pilot = buildPilotProgramSnapshots(source)[2];
const mutationId = "11111111-1111-4111-8111-111111111111";
const body = { sourceId: pilot.sourceId, sourceVersion: pilot.sourceVersion, clientMutationId: mutationId };
const exercise = { id: mutationId, name: pilot.name.fr, equipment: pilot.equipment.labels.fr, cue: { fr: "", en: "" },
  defaultUnit: pilotDefaultUnit(pilot), archived: false, version: 1, createdBy: mutationId, updatedAt: "2026-10-23T12:00:00Z", canEdit: false, pilot };
function request(input: unknown = body, origin: string | null = "https://staging.example") {
  return new Request("http://internal-next/api/v1/coach/exercise-pilot/select", { method: "POST", headers: {
    "content-type": "application/json", ...(origin ? { origin } : {}),
  }, body: JSON.stringify(input) });
}
describe("pilot selection boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example"); mocks.guard.mockResolvedValue({}); mocks.rpc.mockResolvedValue({ data: exercise, error: null }); });
  afterEach(() => vi.unstubAllEnvs());
  it("selects only an identity through the authenticated RPC and does not cache", async () => {
    const response = await selectPilotExerciseHttp(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: { exercise } });
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("select_training_pilot_exercise", { p_source_id: pilot.sourceId, p_source_version: pilot.sourceVersion, p_idempotency_key: mutationId });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([null, "https://evil.example", "null"])("denies untrusted origin %s before database access", async (origin) => {
    expect((await selectPilotExerciseHttp(request(body, origin))).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([401, 403])("respects the existing session/role denial %i", async (status) => {
    mocks.guard.mockRejectedValue(new M1ContractError(status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Denied", status));
    expect((await selectPilotExerciseHttp(request())).status).toBe(status); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ ...body, organizationId: mutationId }, { ...body, pilot }, { ...body, sourceId: "MA_028/HST_RS2700" }, { ...body, sourceVersion: null }])("rejects browser-supplied scope, model or source content", async (input) => {
    expect((await selectPilotExerciseHttp(request(input))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["FE_PILOT_DISABLED", 503], ["FE_INVALID_PILOT_EXERCISE", 400], ["FE_IDEMPOTENCY_CONFLICT", 409], ["PRIVATE_SQL_WITH_SECRET", 503]] as const)("sanitizes %s", async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await selectPilotExerciseHttp(request()); expect(response.status).toBe(status); expect(await response.text()).not.toContain(message);
  });
  it.each([{ ...exercise, pilot: undefined }, { ...exercise, canEdit: true }, { ...exercise, pilot: { ...pilot, sourceId: "DB_001" } }])("rejects mismatched or mutable snapshots", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await selectPilotExerciseHttp(request())).status).toBe(503);
  });
  it("locks database seed to all fifteen projected snapshots, with no named machine variant", () => {
    const sql = readFileSync("supabase/migrations/202610230003_training_pilot_catalog.sql", "utf8");
    const seed = JSON.parse(sql.split("$pilot_seed$")[1]);
    expect(seed).toEqual(buildPilotProgramSnapshots(source).map((item) => ({ source_id: item.sourceId, pilot: item, default_unit: pilotDefaultUnit(item) })));
    expect(seed).toHaveLength(15); expect(seed.every((item: { pilot: object }) => !("machines" in item.pilot))).toBe(true);
    expect(seed[2].pilot.instructions.fr.finish).toContain("chaque bras séparément");
    expect(seed[2].pilot.performance.notes.fr).not.toContain("aucune performance n’est enregistrée");
  });
});
