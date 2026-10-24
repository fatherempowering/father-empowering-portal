import "server-only";
import source from "./source.json";
import { queryPilotCatalog } from "./model";
import type { ExercisePilotQuery } from "@/lib/contracts/exercise-pilot";

export function readPilotCatalog(input: ExercisePilotQuery) {
  return queryPilotCatalog(source, input);
}
