import { describe, expect, it } from "vitest";
import {
  exerciseDefinitionSchema, exerciseMediaReferenceSchema, saveExerciseRequestSchema,
  trainingBlockSchema, trainingPrescriptionSchema, trainingProgramDraftSchema, trainingSessionSchema,
} from "@/lib/contracts/training";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { reps: "8-10", targetRir: 2, restSeconds: 90, tempo: "3-1-1-0", loadTarget: "40 lb", unit: "lb" };
const exercise = { name: "Dumbbell Press", equipment: "Dumbbells", cue: { fr: "Contrôle la descente.", en: "Control the lowering." }, defaultUnit: "lb", archived: false };
const movement = (n: number) => ({ id: id(n), libraryExerciseId: id(100), name: exercise.name, cue: exercise.cue, media: null, prescription: { ...base, sets: 3 } });
const block = { id: id(2), label: { fr: "Principal", en: "Main" }, mode: "standard", restSeconds: 90, exercises: [movement(3)] };
const session = { id: id(1), title: { fr: "Séance A", en: "Session A" }, type: "training", required: true, schedule: { mode: "suggested", day: 1 }, warmup: { fr: "", en: "" }, blocks: [block] };
const program = { schemaVersion: 1, phaseId: id(20), title: { fr: "Phase 1", en: "Phase 1" }, weeks: [{ number: 1, objective: { fr: "", en: "" }, sessions: [session] }] };

describe("Training foundation contracts", () => {
  it("keeps the reusable exercise separate from the client prescription", () => {
    expect(exerciseDefinitionSchema.parse(exercise)).toEqual(exercise);
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, clientId: id(9) }).success).toBe(false);
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, prescription: base }).success).toBe(false);
  });
  it.each(["", " ", "x".repeat(161)])("rejects invalid names (%s)", (name) => {
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, name }).success).toBe(false);
  });
  it("does not silently add kg or accept excessive instructions", () => {
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, defaultUnit: "kg" }).success).toBe(false);
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, cue: { fr: "x".repeat(301), en: "" } }).success).toBe(false);
  });
  it("requires retry identity and exact version semantics", () => {
    const command = { id: null, expectedVersion: 0, clientMutationId: id(5), exercise };
    expect(saveExerciseRequestSchema.parse(command)).toEqual(command);
    for (const patch of [{ clientMutationId: "bad" }, { expectedVersion: 1 }, { id: id(8) }, { exercise: { ...exercise, archived: true } }]) {
      expect(saveExerciseRequestSchema.safeParse({ ...command, ...patch }).success).toBe(false);
    }
    expect(saveExerciseRequestSchema.safeParse({ ...command, id: id(8), expectedVersion: 1 }).success).toBe(true);
  });
  it("represents multiple weeks, stable identities and immutable exercise snapshots", () => {
    expect(trainingProgramDraftSchema.parse(program).weeks).toHaveLength(1);
    const extended = { ...program, weeks: [...program.weeks, { ...program.weeks[0], number: 2 }] };
    expect(trainingProgramDraftSchema.parse(extended).weeks).toHaveLength(2);
    expect(trainingProgramDraftSchema.safeParse({ ...extended, weeks: [...program.weeks, { ...program.weeks[0], number: 3 }] }).success).toBe(false);
    expect(trainingProgramDraftSchema.safeParse({ ...program, weeks: [{ ...program.weeks[0], sessions: [session, session] }] }).success).toBe(false);
  });
  it("distinguishes missing training from explicitly prescribed rest", () => {
    expect(trainingSessionSchema.safeParse({ ...session, blocks: [] }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...session, type: "complete-rest", blocks: [] }).success).toBe(true);
    expect(trainingSessionSchema.safeParse({ ...session, type: "complete-rest" }).success).toBe(false);
  });
  it("requires a day only for fixed/suggested schedules", () => {
    expect(trainingSessionSchema.safeParse({ ...session, schedule: { mode: "fixed", day: null } }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...session, schedule: { mode: "flexible", day: 1 } }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...session, schedule: { mode: "flexible", day: null } }).success).toBe(true);
  });
  it("preserves supersets and finishers with matching rounds", () => {
    const grouped = { ...block, mode: "superset", exercises: [movement(3), movement(4)] };
    expect(trainingBlockSchema.safeParse(grouped).success).toBe(true);
    expect(trainingBlockSchema.safeParse({ ...grouped, exercises: [movement(3)] }).success).toBe(false);
    expect(trainingBlockSchema.safeParse({ ...grouped, exercises: [...grouped.exercises, movement(5)] }).success).toBe(false);
    expect(trainingBlockSchema.safeParse({ ...grouped, mode: "finisher", exercises: [...grouped.exercises, movement(5)] }).success).toBe(true);
    expect(trainingBlockSchema.safeParse({ ...grouped, exercises: [movement(3), { ...movement(4), prescription: { ...base, sets: 2 } }] }).success).toBe(false);
  });
  it("only uses per-set detail when the sets actually differ", () => {
    expect(trainingPrescriptionSchema.safeParse({ ...base, sets: 2 }).success).toBe(true);
    expect(trainingPrescriptionSchema.safeParse({ ...base, sets: 2, prescribedSets: [base, base] }).success).toBe(false);
    expect(trainingPrescriptionSchema.safeParse({ ...base, sets: 2, prescribedSets: [{ ...base, reps: "12" }] }).success).toBe(false);
    expect(trainingPrescriptionSchema.safeParse({ ...base, sets: 2, prescribedSets: [base, { ...base, reps: "12" }] }).success).toBe(true);
  });
  it("reserves typed private media references without accepting arbitrary URLs", () => {
    expect(exerciseMediaReferenceSchema.safeParse({ assetId: id(7), kind: "VIDEO" }).success).toBe(true);
    expect(exerciseMediaReferenceSchema.safeParse({ assetId: id(7), kind: "VIDEO", url: "https://external.invalid/file" }).success).toBe(false);
    expect(exerciseDefinitionSchema.safeParse({ ...exercise, image: "https://external.invalid/image" }).success).toBe(false);
  });
});
