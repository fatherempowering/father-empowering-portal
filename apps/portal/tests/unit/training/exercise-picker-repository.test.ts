import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLibraryExercise, newBlock, newProgram, newSession } from "@/lib/training/program-editor";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
import { listTrainingExercises } from "@/lib/training/exercise-repository";
const actorId = "18000000-0000-4000-8000-000000000001";
const orgId = "28000000-0000-4000-8000-000000000001";
const row = (n: number, name: string) => ({ id: `48000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name, equipment: "", cue_fr: "", cue_en: "", default_unit: "lb", archived: false, row_version: 1, created_by: actorId, updated_at: "2026-10-13T12:00:00Z", pilot: null });
function query(data: unknown[]) {
  return Object.assign(Promise.resolve({ data, error: null }), { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis() });
}
describe("picker repository server-side pagination", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: actorId, organizationId: orgId, role: "COACH" }); });
  it("filters muscle groups before counting and paginating personal library names", async () => {
    const records = [...Array.from({ length: 52 }, (_, n) => row(n, `Bench press ${n}`)), row(100, "Chest-supported row")];
    const q = query(records); mocks.from.mockReturnValue(q);
    const result = await listTrainingExercises({ page: 1, query: "", archived: "false", muscleGroup: "chest" });
    expect(result.total).toBe(52); expect(result.items).toHaveLength(2);
    expect(result.items.every(x => x.name.startsWith("Bench"))).toBe(true);
    expect(q.eq).toHaveBeenCalledWith("organization_id", orgId);
  });
  it("ranks actual saved usage ahead of alphabetic page one and exposes no draft content", async () => {
    const rows = [...Array.from({ length: 51 }, (_, n) => row(n, `A press ${n}`)), row(60, "Z press")];
    const target = rows[51];
    const program = newProgram(); const session = newSession(); const block = newBlock();
    block.exercises = [addLibraryExercise({ id: target.id, name: target.name, equipment: "", cue: { fr: "", en: "" }, defaultUnit: "lb", archived: false, version: 1, createdBy: actorId, updatedAt: target.updated_at, canEdit: true })];
    session.blocks.push(block); program.weeks[0].sessions.push(session);
    mocks.from.mockImplementation(table => table === "training_exercises" ? query(rows) : query([{ document: program }]));
    const result = await listTrainingExercises({ page: 0, query: "", archived: "false", sort: "usage" });
    expect(result.total).toBe(52); expect(result.items[0].id).toBe(target.id);
    expect(result.usageCounts).toEqual({ [`library:${target.id}`]: 1 });
    expect(result.usageAvailable).toBe(true);
    expect(result).not.toHaveProperty("document");
    expect(result).not.toHaveProperty("program");
  });
});
