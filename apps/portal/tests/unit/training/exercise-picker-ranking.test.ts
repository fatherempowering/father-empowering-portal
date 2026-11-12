import { describe, expect, it } from "vitest";
import source from "@/lib/training/pilot/catalogue-source.json";
import pilotSource from "@/lib/training/pilot/source.json";
import coverage from "@/lib/training/pilot/catalogue-coverage-source.json";
import { buildCatalogueIndex, queryCatalogue } from "@/lib/training/pilot/catalogue";
import { exercisePilotQuerySchema } from "@/lib/contracts/exercise-pilot";
import { exerciseListQuerySchema } from "@/lib/contracts/training";
import { matchesExerciseMuscleGroup, matchesLibraryMuscleGroup } from "@/lib/training/exercise-picker-groups";
import { countSavedExerciseUsage } from "@/lib/training/exercise-usage";
import { addLibraryExercise, newBlock, newProgram, newSession } from "@/lib/training/program-editor";

const index = buildCatalogueIndex(source, pilotSource, coverage);
const query = (input: unknown, usage: Record<string, number> = {}) => queryCatalogue(index, exercisePilotQuerySchema.parse(input), usage);

describe("coach picker groups and saved usage", () => {
  it.each(["chest", "back", "legs", "shoulders", "arms", "core"] as const)("filters %s before pagination and combines with text search", muscleGroup => {
    const result = query({ muscleGroup, query: "row", sort: "usage" });
    expect(result.items.every(item => matchesExerciseMuscleGroup(item.muscles, muscleGroup))).toBe(true);
    const broad = query({ muscleGroup, sort: "usage" });
    expect(broad.total).toBeGreaterThan(0);
    expect(broad.items.every(item => matchesExerciseMuscleGroup(item.muscles, muscleGroup))).toBe(true);
    expect(result.total).toBeLessThanOrEqual(broad.total);
  });
  it.each([
    ["DB_074", "arms"], ["DB_076", "arms"], ["DB_077", "arms"],
    ["BA_077", "legs"], ["BA_080", "legs"],
  ] as const)("includes %s in its anatomical group %s", (id, muscleGroup) => {
    const result = query({ muscleGroup, query: id });
    expect(result.items.map(item => item.id)).toEqual([id]);
    const unrelated = query({ muscleGroup: muscleGroup === "arms" ? "legs" : "arms", query: id });
    expect(unrelated.items).toEqual([]);
  });
  it("ranks a frequent item from any alphabetical page first without changing selection eligibility", () => {
    const item = index.rows.find(row => row.item.id === "DB_034")!.item;
    const first = query({ sort: "usage", limit: 1 }, { "pilot:DB_034": 99 });
    expect(first.items[0].id).toBe("DB_034");
    expect(first.items[0].selection).toEqual(item.selection);
    const next = query({ sort: "usage", offset: 1, limit: 1 }, { "pilot:DB_034": 99 });
    expect(next.items[0].id).not.toBe("DB_034");
    expect(query({ sort: "usage", query: "zzzzunknown" }, { "pilot:DB_034": 99 }).total).toBe(0);
  });
  it("uses deterministic alphabetical fallback when there is no saved usage", () => {
    const rows = query({ sort: "usage" }).items;
    expect(rows.map(x => x.name.fr)).toEqual([...rows.map(x => x.name.fr)].sort((a, b) => a.localeCompare(b, "fr")));
  });
  it("rejects invented groups and sort modes", () => {
    for (const schema of [exercisePilotQuerySchema, exerciseListQuerySchema]) {
      expect(schema.safeParse({ muscleGroup: "invented" }).success).toBe(false);
      expect(schema.safeParse({ sort: "secret" }).success).toBe(false);
    }
  });
  it("does not classify a chest-supported row as a chest exercise in the personal library", () => {
    expect(matchesLibraryMuscleGroup("Chest-supported row", "chest")).toBe(false);
    expect(matchesLibraryMuscleGroup("Chest-supported row", "back")).toBe(true);
    expect(matchesLibraryMuscleGroup("Élévation latérale", "shoulders")).toBe(true);
  });
  it("counts actual saved exercise occurrences, not sets, and ignores malformed documents", () => {
    const id = "19000000-0000-4000-8000-000000000001";
    const exercise = { id, name: "Press", equipment: "Dumbbells", cue: { fr: "Contrôle", en: "Control" }, defaultUnit: "lb" as const, archived: false, version: 1, createdBy: id, updatedAt: "2026-10-14T00:00:00Z", canEdit: true };
    const program = newProgram(); const session = newSession(); const block = newBlock();
    block.exercises = [addLibraryExercise(exercise), addLibraryExercise(exercise)];
    block.exercises[0].prescription.sets = 10;
    session.blocks.push(block); program.weeks[0].sessions.push(session);
    expect(countSavedExerciseUsage([program, null, { weeks: "broken" }])).toEqual({ [`library:${id}`]: 2 });
  });
});
