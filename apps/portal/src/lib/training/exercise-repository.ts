import "server-only";

import { requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import {
  exerciseListSchema, exerciseSnapshotSchema, saveExerciseRequestSchema,
  type ExerciseListQuery, type SaveExerciseRequest,
} from "@/lib/contracts/training";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export function trainingRepositoryError(error: { message: string } | null) {
  const codes = [
    ["FE_UNAUTHENTICATED", "UNAUTHENTICATED", 401],
    ["FE_FORBIDDEN", "FORBIDDEN", 403],
    ["FE_NOT_FOUND", "NOT_FOUND", 404],
    ["FE_INVALID_TRAINING_EXERCISE", "VALIDATION_FAILED", 400],
    ["FE_VERSION_CONFLICT", "VERSION_CONFLICT", 409],
    ["FE_IDEMPOTENCY_CONFLICT", "DUPLICATE", 409],
  ] as const;
  for (const [marker, code, status] of codes) {
    if (error?.message === marker) return new M1ContractError(code, "Exercise operation denied", status);
  }
  // Never return database errors, SQL, parameters or exception details.
  return new M1ContractError("TEMPORARILY_UNAVAILABLE", "Exercise library is temporarily unavailable", 503);
}

export async function listTrainingExercises(input: ExerciseListQuery) {
  const actor = await requireCoachVerified();
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("training_exercises")
    .select("id, name, equipment, cue_fr, cue_en, default_unit, archived, row_version, created_by, updated_at, pilot", { count: "exact" })
    .eq("organization_id", actor.organizationId)
    .eq("archived", input.archived === "true")
    .order("name").order("id")
    .range(input.page * 50, input.page * 50 + 49);
  if (input.query) {
    const literal = input.query.replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name", `%${literal}%`);
  }
  const { data, error, count } = await query;
  if (error) throw trainingRepositoryError(error);
  if (!data || count === null) throw trainingRepositoryError(null);
  return exerciseListSchema.parse({
    items: data.map((row) => ({
      id: row.id, name: row.name, equipment: row.equipment,
      cue: { fr: row.cue_fr, en: row.cue_en }, defaultUnit: row.default_unit,
      archived: row.archived, version: row.row_version,
      createdBy: row.created_by, updatedAt: row.updated_at,
      canEdit: !row.pilot && (actor.role === "ADMIN" || row.created_by === actor.userId),
      ...(row.pilot ? { pilot: row.pilot } : {}),
    })),
    total: count, page: input.page, pageSize: 50,
  });
}

export async function saveTrainingExercise(input: SaveExerciseRequest) {
  await requireCoachVerified();
  const parsed = saveExerciseRequestSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_training_exercise", {
    p_exercise_id: parsed.id,
    p_name: parsed.exercise.name,
    p_equipment: parsed.exercise.equipment,
    p_cue_fr: parsed.exercise.cue.fr,
    p_cue_en: parsed.exercise.cue.en,
    p_default_unit: parsed.exercise.defaultUnit,
    p_archived: parsed.exercise.archived,
    p_expected_version: parsed.expectedVersion,
    p_idempotency_key: parsed.clientMutationId,
  });
  if (error) throw trainingRepositoryError(error);
  return exerciseSnapshotSchema.parse(data);
}
