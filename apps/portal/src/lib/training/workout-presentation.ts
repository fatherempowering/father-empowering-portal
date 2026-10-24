import type { DraftExercise } from "@/lib/contracts/training-drafts";
import type { WorkoutSetInput, WorkoutSetResult } from "@/lib/contracts/training-results";

type SetWithUnit = WorkoutSetInput & Pick<WorkoutSetResult, "unit">;

export function publishedExerciseName(exercise: DraftExercise, french: boolean) {
  return exercise.pilot?.name[french ? "fr" : "en"] ?? exercise.name;
}

export function repetitionLabel(exercise: DraftExercise, french: boolean) {
  if (exercise.pilot?.performance.countingDecision === "MAX_PER_ARM_2026_10_23" ||
      ["DB_025", "CA_050", "MA_063"].includes(exercise.pilot?.sourceId ?? "")) {
    return french ? "Répétitions par bras" : "Reps per arm";
  }
  if (exercise.pilot?.sourceId === "BA_027") return french ? "Répétitions par côté" : "Reps per side";
  return french ? "Répétitions" : "Reps";
}

export function measurementLabel(unit: SetWithUnit["unit"], french: boolean, exercise?: DraftExercise) {
  const labels = {
    lb: french ? "Charge (lb)" : "Load (lb)",
    kg: french ? "Charge (kg)" : "Load (kg)",
    min: french ? "Durée (min)" : "Duration (min)",
    sec: french ? "Durée (sec)" : "Duration (sec)",
    distance: exercise?.pilot ? "Distance (m)" : "Distance",
    level: french ? "Niveau" : "Level",
    configuration: french ? "Configuration utilisée" : "Setup used",
  } as const;
  return labels[unit];
}

export function needsMeasurementDetails(exercise: DraftExercise, unit: SetWithUnit["unit"]) {
  return unit === "configuration" || (unit === "distance" && exercise.pilot?.performance.measure === "distance");
}

export function detailsLabel(exercise: DraftExercise, unit: SetWithUnit["unit"], french: boolean) {
  return unit === "distance" && exercise.pilot
    ? french ? "Charges transportées et unités" : "Carried weights and units"
    : french ? "Configuration utilisée" : "Setup used";
}

export function completedMeasurementMissing(exercise: DraftExercise, set: SetWithUnit) {
  if (set.status !== "DONE") return false;
  if (set.unit === "configuration") return set.load !== null || set.reps === null || !set.details?.trim();
  return set.load === null || (["lb", "kg"].includes(set.unit) && set.reps === null) ||
    (needsMeasurementDetails(exercise, set.unit) && !set.details?.trim());
}

export function clearSetMeasurements<T extends WorkoutSetInput>(set: T): T {
  return { ...set, reps: null, load: null, rir: null, ...(set.details !== undefined ? { details: null } : {}) };
}

export function stripDerivedSet(item: WorkoutSetInput): WorkoutSetInput {
  return {
    exerciseId: item.exerciseId, setNumber: item.setNumber, status: item.status,
    reps: item.status === "DONE" ? item.reps : null,
    load: item.status === "DONE" ? item.load : null,
    rir: item.status === "DONE" ? item.rir : null,
    ...(item.details !== undefined ? { details: item.status === "DONE" ? item.details?.trim() || null : null } : {}),
  };
}
