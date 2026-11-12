import { matchesExerciseMuscleGroup, type ExerciseMuscleGroup } from "../exercise-picker-groups";
import "server-only";
import source from "./source.json";
import catalogue from "./catalogue-source.json";
import coverage from "./catalogue-coverage-source.json";
import { buildCatalogueIndex, queryCatalogue } from "./catalogue";
import type { ExercisePilotQuery } from "@/lib/contracts/exercise-pilot";

const index = buildCatalogueIndex(catalogue, source, coverage);
export function readPilotCatalog(input: ExercisePilotQuery, usageCounts: Record<string, number> = {}) {
  return queryCatalogue(index, input, usageCounts);
}

export function matchesPilotCatalogGroup(sourceId: string, group: ExerciseMuscleGroup = "all") {
  if (group === "all") return true;
  const row = index.rows.find(row => row.item.id === sourceId);
  return !!row && matchesExerciseMuscleGroup(row.item.muscles, group);
}
