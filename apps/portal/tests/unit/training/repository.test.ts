import { beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";
const auth = vi.hoisted(() => ({ requireCoachVerified: vi.fn() }));
const client = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => auth);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => client) }));
import { listTrainingExercises, saveTrainingExercise, trainingRepositoryError } from "@/lib/training/exercise-repository";
const command = {
  id: null, expectedVersion: 0, clientMutationId: "10000000-0000-4000-8000-000000000005",
  exercise: { name: "Dumbbell Press", equipment: "", cue: { fr: "", en: "" }, defaultUnit: "lb" as const, archived: false },
};
describe("Exercise repository authorization", () => {
  beforeEach(() => vi.resetAllMocks());
  it("refuses both reads and writes before touching Supabase when staff verification fails", async () => {
    auth.requireCoachVerified.mockRejectedValue(new M1ContractError("FORBIDDEN", "Denied", 403));
    await expect(listTrainingExercises({ page: 0, query: "", archived: "false" })).rejects.toThrow("Denied");
    await expect(saveTrainingExercise(command)).rejects.toThrow("Denied");
    expect(client.rpc).not.toHaveBeenCalled(); expect(client.from).not.toHaveBeenCalled();
  });
  it("uses the authenticated RPC and never accepts an organization/actor parameter", async () => {
    auth.requireCoachVerified.mockResolvedValue({});
    client.rpc.mockResolvedValue({ data: null, error: { message: "FE_VERSION_CONFLICT" } });
    await expect(saveTrainingExercise(command)).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(client.rpc).toHaveBeenCalledWith("save_training_exercise", {
      p_exercise_id: null, p_name: "Dumbbell Press", p_equipment: "", p_cue_fr: "", p_cue_en: "",
      p_default_unit: "lb", p_archived: false, p_expected_version: 0, p_idempotency_key: command.clientMutationId,
    });
  });
  it("only maps exact allowlisted SQL errors", () => {
    expect(trainingRepositoryError({ message: "FE_NOT_FOUND" }).status).toBe(404);
    expect(trainingRepositoryError({ message: "secret FE_NOT_FOUND other" }).status).toBe(503);
    expect(trainingRepositoryError({ message: "private detail" }).message).not.toContain("private detail");
  });
  it("scopes and paginates reads to the verified organization with escaped search and ownership", async () => {
    const actorId = "18000000-0000-4000-8000-000000000001";
    const orgId = "28000000-0000-4000-8000-000000000001";
    const result = { error: null, count: 51, data: [{
      id: "48000000-0000-4000-8000-000000000001", name: "Press", equipment: "", cue_fr: "", cue_en: "",
      default_unit: "lb", archived: false, row_version: 2,
      created_by: "18000000-0000-4000-8000-000000000002", updated_at: "2026-10-13T12:00:00Z",
    }] };
    const query = Object.assign(Promise.resolve(result), {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
    });
    client.from.mockReturnValue(query);
    auth.requireCoachVerified.mockResolvedValue({ userId: actorId, organizationId: orgId, role: "COACH" });
    const list = await listTrainingExercises({ query: "Press_100%", page: 1, archived: "false" });
    expect(query.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(query.eq).toHaveBeenCalledWith("archived", false);
    expect(query.range).toHaveBeenCalledWith(50, 99);
    expect(query.ilike).toHaveBeenCalledWith("name", "%Press\\_100\\%%");
    expect(list.items[0].canEdit).toBe(false);
    expect(list.total).toBe(51);
  });
});
