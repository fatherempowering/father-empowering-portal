import { NextResponse } from "next/server";
import { requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import { exerciseSnapshotSchema } from "@/lib/contracts/training";
import { selectPilotExerciseRequestSchema } from "@/lib/contracts/training-pilot";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trainingRepositoryError } from "@/lib/training/exercise-repository";

export async function selectPilotExerciseHttp(request: Request) {
  try {
    requireSameOrigin(request);
    await requireCoachVerified();
    const input = selectPilotExerciseRequestSchema.parse(await readJsonObjectWithLimit(request, 2_048));
    // The authenticated RPC reads a fixed database catalogue. The browser may
    // send an identity, never instructions, an organization or a readiness flag.
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("select_training_pilot_exercise", {
      p_source_id: input.sourceId, p_source_version: input.sourceVersion,
      p_idempotency_key: input.clientMutationId,
    });
    if (error?.message === "FE_PILOT_DISABLED") throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Le lot pilote n’est pas activé dans cet environnement de test.", 503);
    if (error?.message === "FE_INVALID_PILOT_EXERCISE") throw new M1ContractError("VALIDATION_FAILED", "Cette version de la fiche pilote n’est pas disponible.", 400);
    if (error) throw trainingRepositoryError(error);
    const exercise = exerciseSnapshotSchema.parse(data);
    if (!exercise.pilot || exercise.pilot.sourceId !== input.sourceId || exercise.pilot.sourceVersion !== input.sourceVersion || exercise.canEdit) {
      throw new M1ContractError("TEMPORARILY_UNAVAILABLE", "Impossible de sélectionner cette fiche pour le moment.", 503);
    }
    return NextResponse.json({ data: { exercise } }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return m1ErrorResponse(error); }
}
