import { describe, expect, it } from "vitest";
import { buildGuidedUnits, firstPendingGuidedStep, guidedProgress, isGuidedStepSaved, restSecondsRemaining, restRingPercent } from "@/features/training/client/guided-workout";
import type { DraftBlock, DraftSession } from "@/lib/contracts/training-drafts";
import type { WorkoutSetResult } from "@/lib/contracts/training-results";
import { pilotResultExercise, pilotResultSet } from "./pilot-result-fixture";

function fixture(mode: DraftBlock["mode"] = "standard") {
  const first = pilotResultExercise();
  first.id = "a1000000-0000-4000-8000-00000000000a";
  const second = pilotResultExercise("BW_049");
  second.id = "a1000000-0000-4000-8000-00000000000b";
  second.prescription.sets = 1;
  const block: DraftBlock = { id: "a1000000-0000-4000-8000-00000000000c", label: { fr: "Bloc", en: "Block" }, mode, restSeconds: 0, exercises: [first, second] };
  const session: DraftSession = { id: "a1000000-0000-4000-8000-00000000000d", title: { fr: "Séance", en: "Workout" }, type: "training", required: true,
    schedule: { mode: "flexible", day: null }, warmup: { fr: "", en: "" }, blocks: [block] };
  const pending: WorkoutSetResult[] = [first, second].flatMap((exercise) => Array.from({ length: exercise.prescription.sets }, (_, index) => ({
    ...pilotResultSet(exercise), setNumber: index + 1, status: "PENDING", reps: null, load: null,
  })));
  return { session, block, first, second, pending };
}

describe("Legacy guided workout derived from immutable session and saved results", () => {
  it("keeps standard movements in order, without promoting a block based on its label", () => {
    const { session, block, pending, first, second } = fixture();
    block.label.fr = "FINISHER — ceci est un libellé, pas un mode";
    const units = buildGuidedUnits(session, pending);
    expect(units.map((unit) => unit.exercises.map((exercise) => exercise.id))).toEqual([[first.id], [second.id]]);
    expect(units.every((unit) => !unit.grouped)).toBe(true);
    expect(units[0].steps.map((step) => step.members.map((member) => member.setNumber))).toEqual([[1], [2]]);
  });

  it.each(["superset", "finisher"] as const)("keeps %s movements together and never invents a partner set", (mode) => {
    const { session, first, second, pending } = fixture(mode);
    const units = buildGuidedUnits(session, pending);
    expect(units).toHaveLength(1);
    expect(units[0].grouped).toBe(true);
    expect(units[0].steps.map((step) => step.members.map((member) => `${member.exercise.id}:${member.setNumber}`)))
      .toEqual([[`${first.id}:1`, `${second.id}:1`], [`${first.id}:2`]]);
    expect(units[0].steps.every((step) => step.restSeconds === 0)).toBe(true);
  });

  it("uses each frozen set rest and target without rewriting the prescription", () => {
    const { session, first, pending } = fixture();
    const { sets: setCount, ...base } = first.prescription;
    expect(setCount).toBe(2);
    first.prescription.prescribedSets = [{ ...base, reps: "5", restSeconds: 0, unit: "kg" }, { ...base, reps: "9", restSeconds: 45 }];
    const before = JSON.stringify(session);
    const units = buildGuidedUnits(session, pending);
    expect(units[0].steps.map((step) => step.restSeconds)).toEqual([0, 45]);
    expect(units[0].steps[0].members[0].exercise.prescription.prescribedSets?.[0]).toMatchObject({ reps: "5", unit: "kg" });
    expect(JSON.stringify(session)).toBe(before);
    expect(pending.every((set) => set.reps === null && set.load === null)).toBe(true);
  });

  it("counts only confirmed terminal sets, including skipped sets, and resumes the first pending round", () => {
    const { session, pending } = fixture("superset");
    const units = buildGuidedUnits(session, pending);
    // Draft form values have no authority here; the caller passes only snapshot sets.
    const confirmed: WorkoutSetResult[] = pending.map((set, index) => ({ ...set, status: index === 0 ? "DONE" as const : "PENDING" as const }));
    expect(guidedProgress(units, confirmed)).toEqual({ total: 3, done: 1, skipped: 0, resolved: 1, percent: 33 });
    expect(firstPendingGuidedStep(units, confirmed)?.step).toBe(units[0].steps[0]);
    confirmed[2].status = "SKIPPED";
    expect(isGuidedStepSaved(units[0].steps[0], confirmed)).toBe(true);
    expect(firstPendingGuidedStep(units, confirmed)?.step).toBe(units[0].steps[1]);
    confirmed[1].status = "DONE";
    expect(firstPendingGuidedStep(units, confirmed)).toBeNull();
    expect(guidedProgress(units, confirmed)).toEqual({ total: 3, done: 2, skipped: 1, resolved: 3, percent: 100 });
  });

  it("preserves asymmetric extras as individual steps and includes unsaved extras as pending", () => {
    const { session, pending, first, second } = fixture("superset");
    const extras = [
      { ...pilotResultSet(first), setNumber: 4, kind: "EXTRA" as const },
      { ...pilotResultSet(first), setNumber: 3, kind: "EXTRA" as const },
      { ...pilotResultSet(second), setNumber: 2, kind: "EXTRA" as const },
    ];
    const units = buildGuidedUnits(session, [...pending, ...extras]);
    const extraSteps = units[0].steps.filter((step) => step.extra);
    expect(extraSteps.map((step) => step.members.map((member) => `${member.exercise.id}:${member.setNumber}`)))
      .toEqual([[`${first.id}:3`], [`${first.id}:4`], [`${second.id}:2`]]);
    const saved = pending.map((set) => ({ ...set, status: "DONE" as const }));
    expect(firstPendingGuidedStep(units, saved)?.step).toBe(extraSteps[0]);
    expect(guidedProgress(units, saved)).toMatchObject({ total: 6, resolved: 3, percent: 50 });
  });

  it("matches UUID identities case-insensitively, ignores unrelated results, never considers a missing set complete", () => {
    const { session, pending } = fixture();
    const units = buildGuidedUnits(session, pending);
    const saved = pending.map((set) => ({ ...set, exerciseId: set.exerciseId.toUpperCase(), status: "DONE" as const }));
    expect(firstPendingGuidedStep(units, saved)).toBeNull();
    expect(guidedProgress(units, saved).percent).toBe(100);
    expect(firstPendingGuidedStep(units, saved.slice(1))?.step).toBe(units[0].steps[0]);
    expect(guidedProgress(units, [{ ...saved[0], exerciseId: "unrelated" }]).resolved).toBe(0);
  });

  it("handles empty recovery sessions without fabricating sets or completion", () => {
    const { session } = fixture();
    session.blocks = [];
    session.type = "complete-rest";
    expect(buildGuidedUnits(session, [])).toEqual([]);
    expect(firstPendingGuidedStep([], [])).toBeNull();
    expect(guidedProgress([], [])).toEqual({ total: 0, done: 0, skipped: 0, resolved: 0, percent: 0 });
  });

  it("keeps rest accurate after a background-tab delay and never produces a negative countdown", () => {
    expect(restSecondsRemaining(100_000, 40_000)).toBe(60);
    expect(restSecondsRemaining(100_000, 99_200)).toBe(1);
    expect(restSecondsRemaining(100_000, 130_000)).toBe(0);
  });

  it("shrinks the green ring against the original duration, clamps it and catches up after backgrounding", () => {
    expect(restRingPercent(100_000, 40_000, 60)).toBe(100);
    expect(restRingPercent(100_000, 70_000, 60)).toBe(50);
    expect(restRingPercent(100_000, 99_500, 60)).toBeCloseTo(0.8333, 3);
    expect(restRingPercent(100_000, 130_000, 60)).toBe(0);
    expect(restRingPercent(100_000, 0, 60)).toBe(100);
    for (const duration of [0, -1, NaN, Infinity]) expect(restRingPercent(100_000, 40_000, duration)).toBe(0);
  });
});
