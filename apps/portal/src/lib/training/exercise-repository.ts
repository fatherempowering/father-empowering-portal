import "server-only";

import { requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import {
  exerciseListSchema, exerciseSnapshotSchema, saveExerciseRequestSchema,
  type ExerciseListQuery, type SaveExerciseRequest, type ExerciseSnapshot,
} from "@/lib/contracts/training";
import { matchesPilotCatalogGroup } from "./pilot/catalog.server";
import { matchesLibraryMuscleGroup } from "./exercise-picker-groups";
import { readOwnExerciseUsage } from "./exercise-usage.server";
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
  if (input.sort === "usage" || (input.muscleGroup && input.muscleGroup !== "all")) {
    return listRankedTrainingExercises(input, actor, supabase);
  }
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

// Apply group and ranking before slicing, so a frequently used exercise cannot
// disappear merely because its name was on a later alphabetical database page.
async function listRankedTrainingExercises(input: ExerciseListQuery, actor: Awaited<ReturnType<typeof requireCoachVerified>>, supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const items: ExerciseSnapshot[] = [];
  for (let offset = 0; ; offset += 200) {
    let query = supabase.from("training_exercises")
      .select("id, name, equipment, cue_fr, cue_en, default_unit, archived, row_version, created_by, updated_at, pilot")
      .eq("organization_id", actor.organizationId).eq("archived", input.archived === "true")
      .order("name").order("id").range(offset, offset + 199);
    if (input.query) query = query.ilike("name", `%${input.query.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error || !data) throw trainingRepositoryError(error);
    for (const row of data) {
      if (row.pilot ? !matchesPilotCatalogGroup(row.pilot.sourceId, input.muscleGroup) : !matchesLibraryMuscleGroup(row.name, input.muscleGroup)) continue;
      items.push(exerciseSnapshotSchema.parse({
        id: row.id, name: row.name, equipment: row.equipment,
        cue: { fr: row.cue_fr, en: row.cue_en }, defaultUnit: row.default_unit,
        archived: row.archived, version: row.row_version, createdBy: row.created_by, updatedAt: row.updated_at,
        canEdit: !row.pilot && (actor.role === "ADMIN" || row.created_by === actor.userId),
        ...(row.pilot ? { pilot: row.pilot } : {}),
      }));
    }
    if (data.length < 200) break;
  }
  const usage = input.sort === "usage" ? await readOwnExerciseUsage() : undefined;
  const count = (item: typeof items[number]) => usage?.counts[item.pilot ? `pilot:${item.pilot.sourceId}` : `library:${item.id}`] ?? 0;
  items.sort((a, b) => count(b) - count(a) || a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
  return exerciseListSchema.parse({
    items: items.slice(input.page * 50, input.page * 50 + 50), total: items.length, page: input.page, pageSize: 50,
    ...(usage ? { usageCounts: usage.counts, usageAvailable: usage.available } : {}),
  });
}
