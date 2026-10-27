import { z } from "zod";

// A separate review contract: these source IDs are deliberately NOT library UUIDs.
const text = z.object({ fr: z.string().trim().min(1).max(2_000), en: z.string().trim().min(1).max(2_000) }).strict();
const label = z.object({ id: z.string().regex(/^[A-Za-z0-9_]+$/).max(100), labels: text }).strict();
const steps = z.object({ setup: z.string().min(1).max(2_000), execution: z.string().min(1).max(2_000), finish: z.string().min(1).max(2_000) }).strict();
export const PILOT_EQUIPMENT = ["dumbbell", "barbell", "cable", "machine", "bodyweight", "kettlebell", "band", "medicine_ball", "sandbag", "sled", "suspension", "plyometric", "battle_rope", "ergometer", "conditioning", "chair", "foam_roller", "massage_ball", "yoga_mat", "support_surface", "wall"] as const;
export const CATALOGUE_SELECTION_REASONS = ["MULTIPLE_LOAD_COMPONENTS", "UNSUPPORTED_MEASURE", "AMBIGUOUS_LOAD_BASIS", "AMBIGUOUS_COUNTING", "UNSUPPORTED_CONFIGURATION", "INCOMPLETE_INSTRUCTIONS"] as const;
const pageInteger = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int());
export const exercisePilotQuerySchema = z.object({
  query: z.string().trim().max(120).default(""),
  equipment: z.enum(["", ...PILOT_EQUIPMENT]).default(""),
  stabilizers: z.enum(["true", "false"]).default("false"),
  offset: pageInteger.pipe(z.number().min(0).max(10_000)).optional(),
  limit: pageInteger.pipe(z.number().min(1).max(50)).optional(),
}).strict();
export type ExercisePilotQuery = z.infer<typeof exercisePilotQuerySchema>;

export const pilotExerciseSchema = z.object({
  id: z.string().regex(/^(DB|BB|CA|MA|BW|KB|BA|LM|MB|SB|SL|SU|PL|BR|ER|CO|MO|MOBX|ATH)_\d{3}$/),
  sourceVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  previousVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
  name: text,
  equipment: label.extend({ id: z.enum(PILOT_EQUIPMENT) }),
  muscles: z.object({ primary: z.array(label).max(32), secondary: z.array(label).max(32), stabilizers: z.array(label).max(32) }).strict(),
  instructions: z.object({ fr: steps, en: steps }).strict(),
  performance: z.object({
    measure: z.enum(["repetitions", "duration", "distance", "passes"]),
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
  selection: z.discriminatedUnion("canSelect", [
    z.object({ canSelect: z.literal(true), reason: z.null() }).strict(),
    z.object({ canSelect: z.literal(false), reason: z.enum(CATALOGUE_SELECTION_REASONS) }).strict(),
  ]).optional(),
}).strict();
export type PilotExercise = z.infer<typeof pilotExerciseSchema>;
export const exercisePilotListSchema = z.object({
  sourceCatalogVersion: z.enum(["3.1.0-pilot.1", "4.0.0-unified.1"]),
  integrationVersion: z.enum(["fe-pilot.1", "fe-catalogue.1"]),
  items: z.array(pilotExerciseSchema).max(50),
  total: z.number().int().min(0).max(1_186),
  catalogSize: z.union([z.literal(15), z.literal(1_186)]),
  equipmentOptions: z.array(label.extend({ id: z.enum(PILOT_EQUIPMENT) })).min(7).max(21),
  pagination: z.object({ offset: z.number().int().min(0).max(10_000), limit: z.number().int().min(1).max(50), hasMore: z.boolean() }).strict().optional(),
}).strict().refine((data) => (data.sourceCatalogVersion === "3.1.0-pilot.1"
  ? data.integrationVersion === "fe-pilot.1" && data.catalogSize === 15 && data.equipmentOptions.length === 7
  : data.integrationVersion === "fe-catalogue.1" && data.catalogSize === 1186 && data.equipmentOptions.length === 21 && !!data.pagination) &&
  new Set(data.items.map((item) => item.id)).size === data.items.length && data.total <= data.catalogSize &&
  (data.pagination ? data.items.length === Math.min(data.pagination.limit, Math.max(0, data.total - data.pagination.offset)) && data.pagination.hasMore === (data.pagination.offset + data.items.length < data.total) : data.total === data.items.length), "Invalid catalogue result count");
export type ExercisePilotList = z.infer<typeof exercisePilotListSchema>;
