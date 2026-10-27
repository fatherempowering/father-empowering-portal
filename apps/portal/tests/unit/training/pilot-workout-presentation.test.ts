import { describe, expect, it } from "vitest";
import { workoutSetResultSchema, saveWorkoutRequestSchema } from "@/lib/contracts/training-results";
import { clearSetMeasurements, completedMeasurementMissing, detailsLabel, detailsPlaceholder, measurementLabel, needsMeasurementDetails, publishedExerciseName, repetitionLabel, stripDerivedSet } from "@/lib/training/workout-presentation";
import { pilotResultExercise, pilotResultSet } from "./pilot-result-fixture";

describe("pilot workout measurements", () => {
  it("does not request fictitious carried weights for band distance or unloaded running", () => {
    const exercise = pilotResultExercise("DB_045");
    exercise.pilot!.performance.loadEntryBasis = "band_configuration";
    expect(detailsLabel(exercise, "distance", true)).toBe("Bande et montage utilisés");
    expect(detailsPlaceholder(exercise, "distance", false)).toBe("E.g. blue band around the thighs");
    exercise.pilot!.performance.loadEntryBasis = "not_applicable";
    expect(detailsLabel(exercise, "distance", false)).toBe("Route context, no added load");
    expect(detailsPlaceholder(exercise, "distance", true)).toContain("sans charge ajoutée");
    const set = { ...pilotResultSet(exercise), unit: "distance" as const, reps: null, load: 100, details: "Course sans charge" };
    expect(completedMeasurementMissing(exercise, set)).toBe(false);
    expect(stripDerivedSet(set)).toMatchObject({ load: 100, details: "Course sans charge", reps: null });
  });
  it("labels kg honestly, requires reps and preserves its numeric value without conversion", () => {
    const exercise = pilotResultExercise();
    exercise.prescription.unit = "kg";
    const result = { ...pilotResultSet(exercise), load: 12.5 };
    expect(measurementLabel("kg", true, exercise)).toBe("Charge (kg)");
    expect(completedMeasurementMissing(exercise, result)).toBe(false);
    expect(completedMeasurementMissing(exercise, { ...result, reps: null })).toBe(true);
    expect(stripDerivedSet(result).load).toBe(12.5);
  });
  it("keeps every per-arm result unchanged when constructing a save", () => {
    const exercise = pilotResultExercise();
    const result = pilotResultSet(exercise);
    expect(repetitionLabel(exercise, true)).toBe("Répétitions par bras");
    expect(repetitionLabel(exercise, false)).toBe("Reps per arm");
    expect(stripDerivedSet(result)).toEqual({ exerciseId: result.exerciseId, setNumber: 1, status: "DONE", reps: 8, load: 20, rir: null });
    expect(completedMeasurementMissing(exercise, result)).toBe(false);
  });

  it("uses frozen localized names and preserves the legacy name fallback", () => {
    const exercise = pilotResultExercise();
    expect(publishedExerciseName(exercise, true)).toBe("Curl alterné");
    expect(publishedExerciseName(exercise, false)).toBe("Alternating curl");
    delete exercise.pilot;
    expect(publishedExerciseName(exercise, true)).toBe(exercise.name);
  });

  it("requires actual configuration text and reps without inventing numeric resistance", () => {
    const exercise = pilotResultExercise("BA_027");
    const set = { ...pilotResultSet(exercise), load: null, details: "Bande rouge, ancrage à hauteur du sternum" };
    expect(needsMeasurementDetails(exercise, set.unit)).toBe(true);
    expect(measurementLabel(set.unit, true, exercise)).toBe("Configuration utilisée");
    expect(workoutSetResultSchema.safeParse(set).success).toBe(true);
    expect(completedMeasurementMissing(exercise, set)).toBe(false);
    for (const bad of [{ ...set, details: "  " }, { ...set, reps: null }, { ...set, load: 0 }]) {
      expect(workoutSetResultSchema.safeParse(bad).success).toBe(false);
      expect(completedMeasurementMissing(exercise, bad)).toBe(true);
    }
  });

  it("captures carried weights separately from the measured distance", () => {
    const exercise = pilotResultExercise("DB_045");
    const set = { ...pilotResultSet(exercise), reps: null, load: 25, details: "2 haltères de 20 lb" };
    expect(measurementLabel(set.unit, true, exercise)).toBe("Distance (m)");
    expect(detailsLabel(exercise, set.unit, false)).toBe("Carried weights and units");
    expect(completedMeasurementMissing(exercise, set)).toBe(false);
    expect(completedMeasurementMissing(exercise, { ...set, details: undefined })).toBe(true);
    expect(stripDerivedSet(set)).toMatchObject({ load: 25, details: "2 haltères de 20 lb", reps: null });
  });

  it("captures hold seconds without requiring invented repetitions or load", () => {
    const exercise = pilotResultExercise("BW_049");
    const set = { ...pilotResultSet(exercise), reps: null, load: 42 };
    expect(measurementLabel(set.unit, true, exercise)).toBe("Durée (sec)");
    expect(completedMeasurementMissing(exercise, set)).toBe(false);
    expect(needsMeasurementDetails(exercise, set.unit)).toBe(false);
    expect(stripDerivedSet(set)).toMatchObject({ load: 42, reps: null });
  });

  it("clears configuration together with other results on pending or skipped sets", () => {
    const set = { ...pilotResultSet(), details: "2 × 20 lb" };
    expect(clearSetMeasurements(set)).toMatchObject({ reps: null, load: null, rir: null, details: null });
    expect(stripDerivedSet({ ...set, status: "SKIPPED" })).toMatchObject({ reps: null, load: null, rir: null, details: null });
    expect(workoutSetResultSchema.safeParse({ ...set, status: "PENDING", reps: null, load: null }).success).toBe(false);
  });

  it("bounds details and keeps result-only unit metadata out of mutation requests", () => {
    const set = { ...pilotResultSet(pilotResultExercise("BA_027")), load: null, details: "Bande verte" };
    const base = { publicationId: set.exerciseId, weekNumber: 1, sessionId: set.exerciseId, expectedVersion: 1,
      clientMutationId: set.exerciseId, status: "IN_PROGRESS", note: null };
    expect(saveWorkoutRequestSchema.safeParse({ ...base, sets: [stripDerivedSet(set)] }).success).toBe(true);
    expect(saveWorkoutRequestSchema.safeParse({ ...base, sets: [set] }).success).toBe(false);
    expect(saveWorkoutRequestSchema.safeParse({ ...base, sets: [{ ...stripDerivedSet(set), details: "x".repeat(501) }] }).success).toBe(false);
  });
});
