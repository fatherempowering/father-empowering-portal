import { z } from "zod";
import { uuidSchema } from "./m1";
import { trainingPrescriptionSchema, trainingTextSchema } from "./training";

// Editing is intentionally distinct from publication readiness: an unfinished
// week, session or superset must be savable. No Client can read this document.
export const draftExerciseSchema = z.object({
  id: uuidSchema, libraryExerciseId: uuidSchema,
  name: z.string().trim().min(1).max(160), cue: trainingTextSchema,
  media: z.null(), // private media delivery is not implemented yet
  prescription: trainingPrescriptionSchema,
}).strict();
export const draftBlockSchema = z.object({
  id: uuidSchema, label: trainingTextSchema,
  mode: z.enum(["standard", "superset", "finisher"]),
  restSeconds: z.number().int().min(0).max(3600),
  exercises: z.array(draftExerciseSchema).max(30),
}).strict();
export const draftSessionSchema = z.object({
  id: uuidSchema, title: trainingTextSchema,
  type: z.enum(["training", "active-recovery", "complete-rest", "posing", "mobility"]),
  required: z.boolean(),
  schedule: z.object({ mode: z.enum(["fixed", "suggested", "flexible"]), day: z.number().int().min(1).max(7).nullable() }).strict(),
  warmup: trainingTextSchema, blocks: z.array(draftBlockSchema).max(20),
}).strict().superRefine((session, ctx) => {
  if ((session.type === "complete-rest" && session.blocks.length) ||
    (session.schedule.mode === "flexible") !== (session.schedule.day === null)) {
    ctx.addIssue({ code: "custom", message: "Invalid rest or schedule", path: ["schedule"] });
  }
});
export const programEditorSchema = z.object({
  schemaVersion: z.literal(1), phaseId: uuidSchema, title: trainingTextSchema,
  weeks: z.array(z.object({
    number: z.number().int().min(1).max(52), objective: trainingTextSchema,
    sessions: z.array(draftSessionSchema).max(14),
  }).strict()).min(1).max(52),
}).strict().superRefine((program, ctx) => {
  if (!program.title.fr && !program.title.en) ctx.addIssue({ code: "custom", message: "A title is required", path: ["title"] });
  for (const [index, week] of program.weeks.entries()) {
    if (week.number !== index + 1) ctx.addIssue({ code: "custom", message: "Weeks must be consecutive", path: ["weeks", index] });
    const ids = week.sessions.flatMap((session) => [session.id, ...session.blocks.flatMap((block) => [block.id, ...block.exercises.map((e) => e.id)])]);
    if (new Set(ids).size !== ids.length || ids.includes(program.phaseId)) ctx.addIssue({ code: "custom", message: "Duplicate identity", path: ["weeks", index] });
  }
  if (new TextEncoder().encode(JSON.stringify(program)).length > 512_000) ctx.addIssue({ code: "custom", message: "Program is too large" });
});
export type ProgramEditor = z.infer<typeof programEditorSchema>;
export type DraftSession = z.infer<typeof draftSessionSchema>;
export type DraftBlock = z.infer<typeof draftBlockSchema>;
export type DraftExercise = z.infer<typeof draftExerciseSchema>;

export const saveProgramRequestSchema = z.object({
  id: uuidSchema.nullable(), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  clientMutationId: uuidSchema, document: programEditorSchema,
}).strict().superRefine((input, ctx) => {
  if ((input.id === null) !== (input.expectedVersion === 0)) ctx.addIssue({ code: "custom", message: "Invalid version" });
});
export type SaveProgramRequest = z.infer<typeof saveProgramRequestSchema>;
export const programSnapshotSchema = z.object({
  id: uuidSchema, version: z.number().int().positive(), document: programEditorSchema,
  createdBy: uuidSchema, updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type ProgramSnapshot = z.infer<typeof programSnapshotSchema>;
export const programListQuerySchema = z.object({ page: z.coerce.number().int().min(0).max(10_000).default(0) }).strict();
export const programListSchema = z.object({
  items: z.array(z.object({ id: uuidSchema, title: trainingTextSchema, version: z.number().int().positive(),
    weekCount: z.number().int().min(1).max(52), updatedAt: z.string().datetime({ offset: true }) }).strict()).max(20),
  total: z.number().int().nonnegative(), page: z.number().int().nonnegative(), pageSize: z.literal(20),
}).strict();
export type ProgramList = z.infer<typeof programListSchema>;
