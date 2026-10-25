import { z } from "zod";
import { uuidSchema } from "./m1";

const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
const nullableNumber = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
export const followupTextSchema = z.object({ fr: z.string().trim().max(4000), en: z.string().trim().max(4000) }).strict();
export const nutritionDocumentSchema = z.object({
  title: followupTextSchema,
  targets: z.object({ calories: nullableNumber(0, 15000), proteinG: nullableNumber(0, 1000), carbohydrateG: nullableNumber(0, 2000), fatG: nullableNumber(0, 1000) }).strict(),
  meals: z.array(z.object({ id: uuidSchema, title: followupTextSchema, timeLabel: followupTextSchema.optional(), portions: followupTextSchema, notes: followupTextSchema }).strict()).max(20),
  instructions: followupTextSchema, preparation: followupTextSchema, grocery: followupTextSchema,
}).strict().superRefine((document, ctx) => {
  if (new Set(document.meals.map(meal => meal.id.toLowerCase())).size !== document.meals.length) ctx.addIssue({ code: "custom", path: ["meals"], message: "Meal identifiers must be unique" });
});
export type NutritionDocument = z.infer<typeof nutritionDocumentSchema>;
export const publishableNutritionDocumentSchema = nutritionDocumentSchema.refine(document =>
  Boolean(document.title.fr || document.title.en) && document.meals.length > 0 &&
  document.meals.every(meal => Boolean(meal.title.fr || meal.title.en) && Boolean(meal.portions.fr || meal.portions.en)),
"Add a title and at least one meal with its portion before publishing");
export const EMPTY_NUTRITION_DOCUMENT: NutritionDocument = {
  title: { fr: "", en: "" }, targets: { calories: null, proteinG: null, carbohydrateG: null, fatG: null }, meals: [],
  instructions: { fr: "", en: "" }, preparation: { fr: "", en: "" }, grocery: { fr: "", en: "" },
};
export const nutritionDraftSchema = z.object({ version, document: nutritionDocumentSchema, updatedAt: timestamp }).strict();
export const nutritionPublicationSchema = z.object({ id: uuidSchema, clientId: uuidSchema, revision: version.refine(n => n > 0), draftVersion: version.refine(n => n > 0), document: nutritionDocumentSchema, publishedAt: timestamp }).strict();
export type NutritionPublication = z.infer<typeof nutritionPublicationSchema>;
export const clientNutritionResponseSchema = z.object({ publication: nutritionPublicationSchema.nullable(), history: z.array(nutritionPublicationSchema).max(50), historyTruncated: z.boolean() }).strict();
export const coachNutritionResponseSchema = clientNutritionResponseSchema.extend({ draft: nutritionDraftSchema.nullable() }).strict();
export const nutritionMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), document: nutritionDocumentSchema, expectedVersion: version, clientMutationId: uuidSchema }).strict(),
  z.object({ action: z.literal("publish"), expectedVersion: version.refine(n => n > 0), expectedPublicationId: uuidSchema.nullable(), clientMutationId: uuidSchema }).strict(),
]);
export type NutritionMutation = z.infer<typeof nutritionMutationSchema>;

export const checkInMeasurementsSchema = z.object({
  bodyWeightLb: nullableNumber(1, 1500), waistIn: nullableNumber(0.1, 200), chestIn: nullableNumber(0.1, 200), hipsIn: nullableNumber(0.1, 200),
  leftArmIn: nullableNumber(0.1, 200), rightArmIn: nullableNumber(0.1, 200), leftThighIn: nullableNumber(0.1, 200), rightThighIn: nullableNumber(0.1, 200),
  leftCalfIn: nullableNumber(0.1, 200), rightCalfIn: nullableNumber(0.1, 200),
}).strict();
export type CheckInMeasurements = z.infer<typeof checkInMeasurementsSchema>;
export const EMPTY_CHECK_IN_MEASUREMENTS: CheckInMeasurements = { bodyWeightLb: null, waistIn: null, chestIn: null, hipsIn: null, leftArmIn: null, rightArmIn: null, leftThighIn: null, rightThighIn: null, leftCalfIn: null, rightCalfIn: null };
const score = z.number().int().min(1).max(10).nullable();
export const checkInDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "Choose a valid calendar date");
export const checkInDocumentSchema = z.object({
  observedOn: checkInDateSchema, measurements: checkInMeasurementsSchema,
  sleepHours: nullableNumber(0, 24), sleepQuality: score, energy: score, stress: score, soreness: score,
  cardioMinutes: nullableNumber(0, 1440), cardioZone: z.number().int().min(1).max(5).nullable(), notes: z.string().trim().max(4000),
}).strict();
export type CheckInDocument = z.infer<typeof checkInDocumentSchema>;
export function checkInHasObservation(document: CheckInDocument): boolean {
  return Object.values(document.measurements).some(value => value !== null) ||
    [document.sleepHours, document.sleepQuality, document.energy, document.stress, document.soreness, document.cardioMinutes, document.cardioZone].some(value => value !== null) || Boolean(document.notes.trim());
}
export const publishableCheckInDocumentSchema = checkInDocumentSchema.superRefine((document, ctx) => {
  if (document.measurements.bodyWeightLb === null) ctx.addIssue({ code: "custom", path: ["measurements", "bodyWeightLb"], message: "Add your measured weight before submitting" });
  if (document.sleepHours === null) ctx.addIssue({ code: "custom", path: ["sleepHours"], message: "Add your sleep duration before submitting" });
  if (document.observedOn > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) ctx.addIssue({ code: "custom", path: ["observedOn"], message: "Choose an observation date that has already occurred" });
});
export function emptyCheckInDocument(observedOn: string): CheckInDocument {
  return { observedOn, measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS }, sleepHours: null, sleepQuality: null, energy: null, stress: null, soreness: null, cardioMinutes: null, cardioZone: null, notes: "" };
}
export const checkInDraftSchema = z.object({ version, document: checkInDocumentSchema, updatedAt: timestamp }).strict();
export const checkInSubmissionSchema = z.object({ id: uuidSchema, clientId: uuidSchema, document: checkInDocumentSchema, submittedAt: timestamp }).strict();
export type CheckInSubmission = z.infer<typeof checkInSubmissionSchema>;
export const checkInsResponseSchema = z.object({ version, draft: checkInDraftSchema.nullable(), history: z.array(checkInSubmissionSchema).max(50), historyTruncated: z.boolean(), page: version, total: version }).strict();
export const coachCheckInsResponseSchema = z.object({ history: z.array(checkInSubmissionSchema).max(50), historyTruncated: z.boolean(), page: version, total: version }).strict();
export const checkInMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), document: checkInDocumentSchema, expectedVersion: version, clientMutationId: uuidSchema }).strict(),
  z.object({ action: z.literal("submit"), expectedVersion: version.refine(n => n > 0), clientMutationId: uuidSchema }).strict(),
]);
export type CheckInMutation = z.infer<typeof checkInMutationSchema>;

export const progressionResponseSchema = z.object({
  baseline: z.object({ source: z.literal("WEEK_ZERO"), recordedAt: timestamp, measurements: checkInMeasurementsSchema }).strict().nullable(),
  checkIns: z.array(checkInSubmissionSchema).max(200), checkInsTruncated: z.boolean(), checkInsTotal: version,
  completedWorkouts: z.object({ total: z.number().int().nonnegative(), dates: z.array(timestamp).max(200), datesTruncated: z.boolean() }).strict(),
}).strict();
export type ClientProgression = z.infer<typeof progressionResponseSchema>;
