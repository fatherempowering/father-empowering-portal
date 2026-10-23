import type { DraftExercise } from "@/lib/contracts/training-drafts";
import type { WorkoutSetResult } from "@/lib/contracts/training-results";

export function pilotResultExercise(sourceId = "DB_034"): DraftExercise {
  const distance = sourceId === "DB_045";
  const duration = sourceId === "BW_049";
  const configuration = sourceId === "BA_027";
  return {
    id: "a1000000-0000-4000-8000-000000000004",
    libraryExerciseId: "a1000000-0000-4000-8000-000000000010",
    name: "Alternating curl", cue: { fr: "", en: "" }, media: null,
    prescription: { sets: 2, reps: distance || duration ? "1" : "8", targetRir: 2, restSeconds: 90,
      tempo: "", loadTarget: configuration ? "Bande rouge" : "20", unit: configuration ? "configuration" : distance ? "distance" : duration ? "sec" : "lb" },
    pilot: {
      sourceId, sourceVersion: "1.2.0", sourceCatalogVersion: "3.1.0-pilot.1", integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST",
      name: { fr: "Curl alterné", en: "Alternating curl" },
      equipment: { id: "dumbbell", labels: { fr: "Haltères", en: "Dumbbells" } },
      instructions: {
        fr: { setup: "Installation française complète.", execution: "Exécution française complète.", finish: "Fin française complète." },
        en: { setup: "Complete English setup.", execution: "Complete English execution.", finish: "Complete English finish." },
      },
      performance: {
        measure: distance ? "distance" : duration ? "duration" : "repetitions",
        counting: { fr: "Répétitions par bras", en: "Repetitions per arm" },
        load: { fr: "Poids d’un haltère.", en: "Weight of one dumbbell." },
        notes: { fr: "À vérifier en staging.", en: "Check in staging." },
        countingDecision: sourceId === "DB_034" ? "MAX_PER_ARM_2026_10_23" : "PROPOSED",
        loadEntryBasis: configuration ? "band_configuration" : duration ? "not_applicable" : "per_implement",
      },
    },
  };
}

export function pilotResultSet(exercise = pilotResultExercise()): WorkoutSetResult {
  return { exerciseId: exercise.id, setNumber: 1, status: "DONE", reps: 8, load: 20, rir: null,
    kind: "PRESCRIBED", unit: exercise.prescription.unit };
}
