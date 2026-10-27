import { z } from "zod";

// A separate review contract: these source IDs are deliberately NOT library UUIDs.
const text = z.object({ fr: z.string().trim().min(1).max(2_000), en: z.string().trim().min(1).max(2_000) }).strict();
const label = z.object({ id: z.string().regex(/^[A-Za-z0-9_]+$/).max(100), labels: text }).strict();
const steps = z.object({ setup: z.string().min(1).max(2_000), execution: z.string().min(1).max(2_000), finish: z.string().min(1).max(2_000) }).strict();
export const PILOT_EQUIPMENT = ["dumbbell", "barbell", "cable", "machine", "bodyweight", "kettlebell", "band"] as const;
export const exercisePilotQuerySchema = z.object({
  query: z.string().trim().max(120).default(""),
  equipment: z.enum(["", ...PILOT_EQUIPMENT]).default(""),
  stabilizers: z.enum(["true", "false"]).default("false"),
}).strict();
export type ExercisePilotQuery = z.infer<typeof exercisePilotQuerySchema>;

export const pilotExerciseSchema = z.object({
  id: z.string().regex(/^(DB|BB|CA|MA|BW|KB|BA)_\d{3}$/),
  sourceVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  previousVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: text,
  equipment: label.extend({ id: z.enum(PILOT_EQUIPMENT) }),
  muscles: z.object({ primary: z.array(label).max(32), secondary: z.array(label).max(32), stabilizers: z.array(label).max(32) }).strict(),
  instructions: z.object({ fr: steps, en: steps }).strict(),
  performance: z.object({
    measure: z.enum(["repetitions", "duration", "distance"]),
    counting: text,
    load: text,
    countingDecision: z.enum(["PROPOSED", "MAX_PER_ARM_2026_10_23"]),
    notes: text,
  }).strict(),
  machines: z.array(z.object({
    id: z.string().max(100), modelId: z.string().max(100), modelVersion: z.string().max(30),
    manufacturer: z.string().min(1).max(160), name: z.string().min(1).max(200),
    evidence: z.enum(["exact_product", "inferred_family"]), warning: text,
    publishable: z.literal(false),
  }).strict()).max(10),
  status: z.literal("DRAFT"),
  instructionReview: z.literal("PENDING"),
  canPrescribe: z.literal(false),
  media: z.null(),
}).strict();
export type PilotExercise = z.infer<typeof pilotExerciseSchema>;
export const exercisePilotListSchema = z.object({
  sourceCatalogVersion: z.literal("3.1.0-pilot.1"),
  integrationVersion: z.literal("fe-pilot.1"),
  items: z.array(pilotExerciseSchema).max(15),
  total: z.number().int().min(0).max(15),
  catalogSize: z.literal(15),
  equipmentOptions: z.array(label.extend({ id: z.enum(PILOT_EQUIPMENT) })).length(7),
}).strict().refine((data) => data.total === data.items.length && new Set(data.items.map((item) => item.id)).size === data.items.length, "Invalid pilot result count");
export type ExercisePilotList = z.infer<typeof exercisePilotListSchema>;
