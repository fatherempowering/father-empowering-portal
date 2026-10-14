import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { requireOwnClientAccess } from "@/lib/auth/own-client-access";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import {
  saveWorkoutRequestSchema, workoutSelectorSchema, workoutSnapshotSchema,
  workoutSessionWireSchema, workoutListSchema, workoutListQuerySchema,
} from "@/lib/contracts/training-results";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { programRepositoryError } from "./program-repository";
import { readCoachPublication } from "./publication-repository";
import { z } from "zod";

export function workoutError(error: { message: string } | null) {
  if (error?.message === "FE_INVALID_WORKOUT") return new M1ContractError("VALIDATION_FAILED", "Check the workout results before saving", 400);
  if (error?.message === "FE_WORKOUT_COMPLETED") return new M1ContractError("VERSION_CONFLICT", "This workout is already completed", 409);
  if (error?.message === "FE_SUPERSEDED_PUBLICATION") return new M1ContractError("VERSION_CONFLICT", "Open the current program before starting a new workout", 409);
  return programRepositoryError(error);
}

export async function readOwnWorkout(input: z.infer<typeof workoutSelectorSchema>) {
  await requireOwnClientAccess();
  return read(input);
}
export async function readCoachWorkout(clientId: string, input: z.infer<typeof workoutSelectorSchema>) {
  await requireCoachVerified();
  const id = uuidSchema.parse(clientId);
  // This RPC checks the current active assignment, including empty history.
  await readCoachPublication(id);
  const result = await read(input);
  if (result.publication.clientId !== id) throw new M1ContractError("NOT_FOUND", "Workout not found", 404);
  return result;
}
async function read(input: z.infer<typeof workoutSelectorSchema>) {
  const parsed = workoutSelectorSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_training_session_result", {
    p_publication_id: parsed.publicationId, p_week_number: parsed.weekNumber, p_session_id: parsed.sessionId,
  });
  if (error) throw workoutError(error);
  return workoutSessionWireSchema.parse(data);
}

export async function saveOwnWorkout(input: z.infer<typeof saveWorkoutRequestSchema>) {
  await requireOwnClientAccess();
  const parsed = saveWorkoutRequestSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_training_session_result", {
    p_publication_id: parsed.publicationId, p_week_number: parsed.weekNumber, p_session_id: parsed.sessionId,
    p_expected_version: parsed.expectedVersion, p_idempotency_key: parsed.clientMutationId,
    p_status: parsed.status, p_sets: parsed.sets, p_note: parsed.note,
  });
  if (error) throw workoutError(error);
  return workoutSnapshotSchema.parse(data);
}

export async function listOwnWorkouts(page: number) {
  await requireOwnClientAccess();
  return list(null, page);
}
export async function listCoachWorkouts(clientId: string, page: number) {
  await requireCoachVerified();
  return list(uuidSchema.parse(clientId), page);
}
async function list(clientId: string | null, page: number) {
  const parsed = workoutListQuerySchema.parse({ page });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_training_session_results", { p_client_id: clientId, p_page: parsed.page });
  if (error) throw workoutError(error);
  return workoutListSchema.parse(data);
}
