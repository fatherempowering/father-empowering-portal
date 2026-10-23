import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";
import { pilotProgramExerciseSchema, validatePilotPrescription } from "./training-pilot";

// Preserve the Legacy units. Adding kg/conversions is a separate product change.
export const TRAINING_UNITS = ["lb", "min", "sec", "distance", "level", "configuration"] as const;
export const trainingUnitSchema = z.enum(TRAINING_UNITS);
export const trainingTextSchema = z.object({
  fr: z.string().trim().max(300),
  en: z.string().trim().max(300),
}).strict();

export const exerciseDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  equipment: z.string().trim().max(120),
  cue: trainingTextSchema,
  defaultUnit: trainingUnitSchema,
  archived: z.boolean(),
}).strict();
export type ExerciseDefinition = z.infer<typeof exerciseDefinitionSchema>;

export const saveExerciseRequestSchema = z.object({
  id: uuidSchema.nullable(),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  clientMutationId: uuidSchema,
  exercise: exerciseDefinitionSchema,
}).strict().superRefine((input, context) => {
  if (input.exercise.defaultUnit === "configuration") {
    context.addIssue({ code: "custom", message: "Configuration measurements are reserved for the staged pilot catalogue" });
  }
  if ((input.id === null && (input.expectedVersion !== 0 || input.exercise.archived)) ||
      (input.id !== null && input.expectedVersion < 1)) {
    context.addIssue({ code: "custom", message: "Invalid exercise version or initial state" });
  }
});
export type SaveExerciseRequest = z.infer<typeof saveExerciseRequestSchema>;

export const exerciseSnapshotSchema = exerciseDefinitionSchema.extend({
  id: uuidSchema,
  version: z.number().int().positive(),
  createdBy: uuidSchema,
  updatedAt: z.string().datetime({ offset: true }),
  canEdit: z.boolean(),
  pilot: pilotProgramExerciseSchema.optional(),
}).strict();
export type ExerciseSnapshot = z.infer<typeof exerciseSnapshotSchema>;

export const exerciseListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).max(10_000).default(0),
  query: z.string().trim().max(120).default(""),
  archived: z.enum(["true", "false"]).default("false"),
}).strict();
export type ExerciseListQuery = z.infer<typeof exerciseListQuerySchema>;
export const exerciseListSchema = z.object({
  items: z.array(exerciseSnapshotSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.literal(50),
}).strict();
export type ExerciseList = z.infer<typeof exerciseListSchema>;

// Contract for future private assets, not an arbitrary external image/video URL.
// No upload/player is exposed until storage authorization and delivery exist.
export const exerciseMediaReferenceSchema = z.object({
  assetId: uuidSchema,
  kind: z.enum(["IMAGE", "VIDEO"]),
}).strict();

const setPrescriptionSchema = z.object({
  reps: z.string().trim().min(1).max(40),
  targetRir: z.number().int().min(0).max(10),
  restSeconds: z.number().int().min(0).max(3_600),
  tempo: z.string().trim().max(40),
  loadTarget: z.string().trim().max(120),
  unit: trainingUnitSchema,
}).strict();

export const trainingPrescriptionSchema = setPrescriptionSchema.extend({
  sets: z.number().int().min(1).max(20),
  // FE-AC: omit per-set prescriptions unless some sets actually differ.
  prescribedSets: z.array(setPrescriptionSchema).min(1).max(20).optional(),
}).strict().superRefine((value, context) => {
  if (!value.prescribedSets) return;
  if (value.prescribedSets.length !== value.sets) {
    context.addIssue({ code: "custom", message: "One prescription is required per set" });
  }
  const firstSet = JSON.stringify(value.prescribedSets[0]);
  if (value.prescribedSets.every((set) => JSON.stringify(set) === firstSet)) {
    context.addIssue({ code: "custom", message: "Identical sets use the common prescription" });
  }
});

const programExerciseSchema = z.object({
  id: uuidSchema,
  libraryExerciseId: uuidSchema,
  // A published program will retain this snapshot when the library changes.
  name: exerciseDefinitionSchema.shape.name,
  cue: trainingTextSchema,
  media: exerciseMediaReferenceSchema.nullable(),
  prescription: trainingPrescriptionSchema,
  pilot: pilotProgramExerciseSchema.optional(),
}).strict().superRefine(validatePilotPrescription);

export const trainingBlockSchema = z.object({
  id: uuidSchema,
  label: trainingTextSchema,
  mode: z.enum(["standard", "superset", "finisher"]),
  restSeconds: z.number().int().min(0).max(3_600),
  exercises: z.array(programExerciseSchema).min(1).max(30),
}).strict().superRefine((block, context) => {
  if (block.mode === "standard") return;
  if ((block.mode === "superset" && block.exercises.length !== 2) ||
      (block.mode === "finisher" && block.exercises.length < 2) ||
      block.exercises.some((exercise) => exercise.prescription.sets !== block.exercises[0].prescription.sets)) {
    context.addIssue({ code: "custom", message: "Grouped rounds must have matching set counts" });
  }
});

export const trainingSessionSchema = z.object({
  id: uuidSchema,
  title: trainingTextSchema,
  type: z.enum(["training", "active-recovery", "complete-rest", "posing", "mobility"]),
  required: z.boolean(),
  schedule: z.object({
    mode: z.enum(["fixed", "suggested", "flexible"]),
    // ISO weekday, not a browser-local date.
    day: z.number().int().min(1).max(7).nullable(),
  }).strict(),
  warmup: trainingTextSchema,
  blocks: z.array(trainingBlockSchema).max(20),
}).strict().superRefine((session, context) => {
  if ((session.type === "training" && !session.blocks.length) ||
      (session.type === "complete-rest" && session.blocks.length) ||
      (session.schedule.mode === "flexible" && session.schedule.day !== null) ||
      (session.schedule.mode !== "flexible" && session.schedule.day === null)) {
    context.addIssue({ code: "custom", message: "Session content and schedule must be explicit" });
  }
});

export const trainingProgramDraftSchema = z.object({
  schemaVersion: z.literal(1),
  phaseId: uuidSchema,
  title: trainingTextSchema,
  weeks: z.array(z.object({
    number: z.number().int().min(1).max(52),
    objective: trainingTextSchema,
    sessions: z.array(trainingSessionSchema).min(1).max(14),
  }).strict()).min(1).max(52),
}).strict().superRefine((program, context) => {
  const ids = new Set<string>();
  for (const [index, week] of program.weeks.entries()) {
    if (week.number !== index + 1) {
      context.addIssue({ code: "custom", message: "Weeks must be consecutive" });
    }
    // Session/exercise identities may repeat across weeks, never within a week.
    ids.clear();
    for (const session of week.sessions) {
      for (const id of [session.id, ...session.blocks.flatMap((block) =>
        [block.id, ...block.exercises.map((exercise) => exercise.id)])]) {
        if (ids.has(id)) context.addIssue({ code: "custom", message: "Duplicate identity within a week" });
        ids.add(id);
      }
    }
  }
});
export type TrainingProgramDraft = z.infer<typeof trainingProgramDraftSchema>;
