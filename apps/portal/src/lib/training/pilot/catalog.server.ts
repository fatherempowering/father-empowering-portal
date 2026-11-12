import "server-only";
import source from "./source.json";
import catalogue from "./catalogue-source.json";
import coverage from "./catalogue-coverage-source.json";
import { buildCatalogueIndex, queryCatalogue } from "./catalogue";
import type { ExercisePilotQuery } from "@/lib/contracts/exercise-pilot";

const index = buildCatalogueIndex(catalogue, source, coverage);
export function readPilotCatalog(input: ExercisePilotQuery) {
  return queryCatalogue(index, input);
}
