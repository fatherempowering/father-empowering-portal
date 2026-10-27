import "server-only";
import source from "./source.json";
import catalogue from "./catalogue-source.json";
import { buildCatalogueIndex, queryCatalogue } from "./catalogue";
import type { ExercisePilotQuery } from "@/lib/contracts/exercise-pilot";

const index = buildCatalogueIndex(catalogue, source);
export function readPilotCatalog(input: ExercisePilotQuery) {
  return queryCatalogue(index, input);
}
