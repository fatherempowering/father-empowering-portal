import { pilotProgramExerciseSchema, type PilotProgramExercise } from "@/lib/contracts/training-pilot";
import { buildPilotCatalog, type PilotSource } from "./model";

// Pure projection shared with seed-integrity tests; the raw source remains
// server-only outside the isolated browser test harness.
export function buildPilotProgramSnapshots(source: PilotSource): PilotProgramExercise[] {
  return buildPilotCatalog(source).items.map((exercise) => pilotProgramExerciseSchema.parse({
    sourceId: exercise.id, sourceVersion: exercise.sourceVersion,
    sourceCatalogVersion: source.catalogVersion, integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST",
    name: exercise.name, equipment: exercise.equipment, instructions: exercise.instructions,
    performance: {
      ...exercise.performance,
      notes: { fr: "Fiche générique utilisée pour ce test staging. Les modèles de machines proposés ne sont pas validés. Aucune résistance réelle ni charge totale n’est calculée automatiquement.", en: "Generic exercise used for this staging test. Proposed machine models are not approved. Actual resistance and total load are never calculated automatically." },
      loadEntryBasis: source.exercises.find((item) => item.id === exercise.id)!.performance.load_entry_basis,
    },
  }));
}
