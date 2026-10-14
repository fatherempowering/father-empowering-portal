import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";
import { draftSessionSchema } from "@/lib/contracts/training-drafts";
import { publicationSchema } from "@/lib/contracts/training-publication";
import { trainingTextSchema, trainingUnitSchema } from "@/lib/contracts/training";

export const workoutStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED"]);
export const workoutSetStatusSchema = z.enum(["PENDING", "DONE", "SKIPPED"]);

export const workoutSetInputSchema = z.object({
  exerciseId: uuidSchema,
  setNumber: z.number().int().min(1).max(40),
  status: workoutSetStatusSchema,
  reps: z.number().int().min(0).max(10_000).nullable(),
  load: z.number().finite().min(0).max(100_000).nullable().refine(
    (value) => value === null || Number(value.toFixed(6)) === value,
    "Load supports at most six decimal places",
  ),
  rir: z.number().int().min(0).max(10).nullable(),
}).strict();
export type WorkoutSetInput = z.infer<typeof workoutSetInputSchema>;

export const workoutSetResultSchema = workoutSetInputSchema.extend({
  // Both fields are derived from the immutable publication, never trusted from
  // the browser. An EXTRA set has a setNumber above the prescribed count.
  kind: z.enum(["PRESCRIBED", "EXTRA"]),
  unit: trainingUnitSchema,
}).strict().superRefine((set, context) => {
  if (set.status === "DONE") {
    if (set.load === null || (set.unit === "lb" && set.reps === null)) {
      context.addIssue({ code: "custom", message: "Completed set measurements are required" });
    }
    return;
  }
  if (set.reps !== null || set.load !== null || set.rir !== null) {
    context.addIssue({ code: "custom", message: "Pending or skipped sets cannot contain measurements" });
  }
});
export type WorkoutSetResult = z.infer<typeof workoutSetResultSchema>;

export const saveWorkoutRequestSchema = z.object({
  publicationId: uuidSchema,
  weekNumber: z.number().int().min(1).max(52),
  sessionId: uuidSchema,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  clientMutationId: uuidSchema,
  status: workoutStatusSchema,
  sets: z.array(workoutSetInputSchema).max(24_000),
  note: z.string().trim().max(2_000).nullable(),
}).strict().superRefine((input, context) => {
  const identities = input.sets.map((set) => `${set.exerciseId.toLowerCase()}:${set.setNumber}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", message: "Set identities must be unique", path: ["sets"] });
  }
  for (const [index, set] of input.sets.entries()) {
    if (input.status === "COMPLETED" && set.status === "PENDING") {
      context.addIssue({ code: "custom", message: "A completed workout cannot contain pending sets", path: ["sets", index, "status"] });
    }
    if (set.status === "DONE") {
      if (set.load === null) {
        context.addIssue({ code: "custom", message: "A completed set requires a measured value", path: ["sets", index, "load"] });
      }
    } else if (set.reps !== null || set.load !== null || set.rir !== null) {
      context.addIssue({ code: "custom", message: "Pending or skipped sets cannot contain measurements", path: ["sets", index] });
    }
  }
  if (input.sets.some((set) => set.status === "SKIPPED") && !input.note?.trim()) {
    context.addIssue({ code: "custom", message: "A skipped set requires a workout note", path: ["note"] });
  }
  if (new TextEncoder().encode(JSON.stringify(input)).length > 4_194_304) {
    context.addIssue({ code: "custom", message: "Workout payload is too large" });
  }
});
export type SaveWorkoutRequest = z.infer<typeof saveWorkoutRequestSchema>;

export const workoutSelectorSchema = z.object({
  publicationId: uuidSchema,
  weekNumber: z.coerce.number().int().min(1).max(52),
  sessionId: uuidSchema,
}).strict();
export type WorkoutSelector = z.infer<typeof workoutSelectorSchema>;

const workoutSnapshotWireFields = {
  id: uuidSchema,
  publicationId: uuidSchema,
  weekNumber: z.number().int().min(1).max(52),
  sessionId: uuidSchema,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: workoutStatusSchema,
  sets: z.array(workoutSetResultSchema).max(24_000),
  note: z.string().max(2_000).nullable(),
  startedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  programTitle: trainingTextSchema,
  publicationRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};
function validateCompletionTimestamp(
  workout: { status: z.infer<typeof workoutStatusSchema>; completedAt: string | null },
  context: z.RefinementCtx,
) {
  if ((workout.status === "COMPLETED") !== (workout.completedAt !== null)) {
    context.addIssue({ code: "custom", message: "Completion timestamp does not match workout status", path: ["completedAt"] });
  }
}
export const workoutWireSnapshotSchema = z.object(workoutSnapshotWireFields).strict()
  .superRefine(validateCompletionTimestamp);
export type WorkoutWireSnapshot = z.infer<typeof workoutWireSnapshotSchema>;
export const workoutSnapshotSchema = z.object({
  ...workoutSnapshotWireFields,
  session: draftSessionSchema,
}).strict().superRefine(validateCompletionTimestamp);
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>;

export const workoutSessionWireSchema = z.object({
  workout: workoutWireSnapshotSchema.nullable(),
  publication: publicationSchema,
}).strict().superRefine((response, context) => {
  if (!response.workout) return;
  const session = response.publication.document.weeks
    .find((week) => week.number === response.workout?.weekNumber)?.sessions
    .find((candidate) => candidate.id === response.workout?.sessionId);
  if (response.workout.publicationId !== response.publication.id || !session ||
      response.workout.publicationRevision !== response.publication.revision ||
      JSON.stringify(response.workout.programTitle) !== JSON.stringify(response.publication.document.title)) {
    context.addIssue({ code: "custom", message: "Workout and publication do not match", path: ["workout"] });
  }
});
export type WorkoutSessionWire = z.infer<typeof workoutSessionWireSchema>;
type WorkoutSessionResponseValue = {
  workout: WorkoutSnapshot | null;
  publication: z.infer<typeof publicationSchema>;
};
export const workoutSessionResponseSchema = workoutSessionWireSchema.transform((response): WorkoutSessionResponseValue => {
  if (!response.workout) return { workout: null, publication: response.publication };
  const session = response.publication.document.weeks
    .find((week) => week.number === response.workout?.weekNumber)!.sessions
    .find((candidate) => candidate.id === response.workout?.sessionId)!;
  return { ...response, workout: { ...response.workout, session } };
});
export type WorkoutSessionResponse = z.infer<typeof workoutSessionResponseSchema>;

export const workoutListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();
export const workoutListItemSchema = z.object({
  id: uuidSchema,
  publicationId: uuidSchema,
  weekNumber: z.number().int().min(1).max(52),
  sessionId: uuidSchema,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: workoutStatusSchema,
  startedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  session: z.object({
    id: uuidSchema,
    title: trainingTextSchema,
    type: z.enum(["training", "active-recovery", "complete-rest", "posing", "mobility"]),
  }).strict(),
  programTitle: trainingTextSchema,
  publicationRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
export const workoutListSchema = z.object({
  items: z.array(workoutListItemSchema).max(20),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.literal(20),
}).strict();
export type WorkoutList = z.infer<typeof workoutListSchema>;
