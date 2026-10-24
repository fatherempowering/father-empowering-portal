import { describe, expect, it } from "vitest";
import source from "@/lib/training/pilot/source.json";
import { buildPilotCatalog, queryPilotCatalog } from "@/lib/training/pilot/model";
import { exercisePilotQuerySchema } from "@/lib/contracts/exercise-pilot";
import { librarySearchTerms, matchesLibraryEquipment, matchesLibrarySearch, splitExerciseSearch } from "@/lib/training/pilot/search-aliases";
import { mergeExerciseSearchResults } from "@/features/training/coach/unified-exercise-picker";
import { pilotResultExercise } from "./pilot-result-fixture";
import type { ExerciseSnapshot } from "@/lib/contracts/training";

const ids = (query: string, equipment = "") => queryPilotCatalog(source, exercisePilotQuerySchema.parse({ query, equipment })).items.map(item => item.id);
describe("one exercise search vocabulary", () => {
  it.each(["pushup", "pushups", "push up", "push-ups", "pompe", "pompes"])("finds the actual push-up through %s", query => {
    expect(ids(query)).toEqual(["BW_021"]);
  });
  it.each(["upperbody", "upper body", "haut du corps"])("uses real upper-body muscle roles for %s", query => {
    expect(ids(query).sort()).toEqual(["DB_025", "DB_034", "CA_001", "CA_050", "MA_018", "MA_028", "MA_063", "BW_021"].sort());
  });
  it("returns push-ups for chest but not the chest-supported row", () => {
    expect(ids("chest")).toContain("BW_021");
    expect(ids("chest")).not.toContain("MA_063");
    expect(matchesLibrarySearch("Chest supported row", "chest")).toBe(false);
    expect(matchesLibrarySearch("Push-ups", "chest")).toBe(true);
    expect(matchesLibrarySearch("Leg press", "upperbody")).toBe(false);
    expect(matchesLibrarySearch("Pallof press", "upper body")).toBe(false);
  });
  it("combines muscle and equipment without inventing a cable Pallof variant", () => {
    expect(ids("abdo à la poulie")).toEqual([]);
    expect(ids("Palloff press au câble")).toEqual([]);
    expect(ids("Palloff press avec bande")).toEqual(["BA_027"]);
    expect(ids("chest", "bodyweight")).toEqual(["BW_021"]);
    expect(ids("pallof bande", "cable")).toEqual([]);
    expect(splitExerciseSearch("abdo à la poulie")).toEqual({ query: "abdos", equipment: "cable" });
  });
  it("bounds the library alias fan-out and keeps equipment filtering explicit", () => {
    for (const query of ["upperbody", "chest", "pompes", "ischio-fessiers", "Développé personnalisé"]) {
      expect(librarySearchTerms(query).length).toBeLessThanOrEqual(8);
      expect(librarySearchTerms(query).length).toBeGreaterThan(0);
    }
    expect(librarySearchTerms("Développé personnalisé")).toContain("Développé personnalisé");
    expect(matchesLibraryEquipment("Élastiques", "cable")).toBe(false);
    expect(matchesLibraryEquipment("Poids du corps", "bodyweight")).toBe(true);
    expect(matchesLibraryEquipment("Câbles", "cable")).toBe(true);
  });
  it("deduplicates a selected pilot by source/version while keeping distinct manual exercises", () => {
    const pilots = buildPilotCatalog(source).items;
    const exercise = pilotResultExercise();
    const selected: ExerciseSnapshot = { id: exercise.libraryExerciseId, name: exercise.name, equipment: "Haltères", cue: exercise.cue,
      defaultUnit: "lb", archived: false, version: 1, createdBy: exercise.id, updatedAt: "2026-10-23T12:00:00Z", canEdit: false, pilot: exercise.pilot };
    const manual = { ...selected, id: "a1000000-0000-4000-8000-000000000099", pilot: undefined, canEdit: true };
    const result = mergeExerciseSearchResults([selected, selected, manual], pilots);
    expect(result).toHaveLength(16);
    expect(result.filter(item => item.key === "pilot:DB_034@1.2.0")).toHaveLength(1);
    expect(result.find(item => item.key === "pilot:DB_034@1.2.0")?.kind).toBe("pilot");
    expect(mergeExerciseSearchResults([{ ...manual, archived: true }], [])).toEqual([]);
  });
});
