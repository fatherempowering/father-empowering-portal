import { z } from "zod";
import { pilotExerciseSchema } from "./exercise-pilot";
import { uuidSchema } from "./m1";

// A versioned, immutable generic exercise description, not an approval of the
// supplier's instructions or its proposed named-machine substitutions.
export const pilotProgramExerciseSchema = z.object({
  sourceId: pilotExerciseSchema.shape.id,
  sourceVersion: pilotExerciseSchema.shape.sourceVersion,
  sourceCatalogVersion: z.enum(["3.1.0-pilot.1", "4.0.0-unified.1"]),
  integrationVersion: z.literal("fe-program-pilot.1"),
  usage: z.literal("STAGING_TEST"),
  name: pilotExerciseSchema.shape.name,
  equipment: pilotExerciseSchema.shape.equipment,
  instructions: pilotExerciseSchema.shape.instructions,
  performance: pilotExerciseSchema.shape.performance.extend({
    measure: z.enum(["repetitions", "duration", "distance"]),
    loadEntryBasis: z.enum(["per_implement", "total_external_mass", "displayed_stack_setting", "band_configuration", "not_applicable", "to_confirm"]),
  }).strict(),
}).strict();
export type PilotProgramExercise = z.infer<typeof pilotProgramExerciseSchema>;

export const selectPilotExerciseRequestSchema = z.object({
  sourceId: pilotExerciseSchema.shape.id,
  sourceVersion: pilotExerciseSchema.shape.sourceVersion,
  clientMutationId: uuidSchema,
}).strict();
export type SelectPilotExerciseRequest = z.infer<typeof selectPilotExerciseRequestSchema>;

export function pilotDefaultUnit(pilot: PilotProgramExercise): "lb" | "sec" | "distance" | "configuration" {
  if (pilot.performance.measure === "duration") return "sec";
  if (pilot.performance.measure === "distance") return "distance";
  if (["band_configuration", "to_confirm"].includes(pilot.performance.loadEntryBasis)) return "configuration";
  return "lb";
}

export function validatePilotPrescription(exercise: {
  pilot?: PilotProgramExercise;
  prescription: { unit: string; prescribedSets?: { unit: string }[] };
}, context: z.RefinementCtx) {
  const prescriptions = [exercise.prescription, ...(exercise.prescription.prescribedSets ?? [])];
  if (prescriptions.some((prescription) => exercise.pilot
    ? !pilotAllowedUnits(exercise.pilot).includes(prescription.unit as ReturnType<typeof pilotAllowedUnits>[number])
    : prescription.unit === "configuration")) {
    context.addIssue({ code: "custom", message: "Measurement unit must match the exercise snapshot", path: ["prescription", "unit"] });
  }
}

export function pilotAllowedUnits(pilot: PilotProgramExercise): ("lb" | "kg" | "sec" | "distance" | "configuration")[] {
  const unit = pilotDefaultUnit(pilot);
  return unit === "lb" && ["per_implement", "total_external_mass", "displayed_stack_setting"].includes(pilot.performance.loadEntryBasis)
    ? ["lb", "kg"] : [unit];
}
