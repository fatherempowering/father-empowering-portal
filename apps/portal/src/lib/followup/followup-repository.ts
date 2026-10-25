import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { requireOwnClientAccess } from "@/lib/auth/own-client-access";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import {
  EMPTY_CHECK_IN_MEASUREMENTS, checkInDraftSchema, checkInMutationSchema, checkInSubmissionSchema, checkInsResponseSchema,
  clientNutritionResponseSchema, coachCheckInsResponseSchema, coachNutritionResponseSchema, nutritionMutationSchema,
  nutritionPublicationSchema, progressionResponseSchema, type CheckInMutation, type NutritionMutation,
} from "@/lib/contracts/client-followup";
import { weekZeroAcquisitionResponsesSchema } from "@/lib/contracts/week-zero-acquisition";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export function followupError(error: { message?: string } | null): M1ContractError {
  const message = error?.message ?? "";
  if (message === "FE_UNAUTHENTICATED") return new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  if (message === "FE_FORBIDDEN") return new M1ContractError("FORBIDDEN", "Operation is not permitted", 403);
  if (message === "FE_NOT_FOUND") return new M1ContractError("NOT_FOUND", "Client follow-up is unavailable", 404);
  if (message === "FE_VERSION_CONFLICT") return new M1ContractError("VERSION_CONFLICT", "This record changed. Reload it before trying again.", 409);
  if (message === "FE_IDEMPOTENCY_CONFLICT") return new M1ContractError("DUPLICATE", "This request identifier was already used.", 409);
  if (message === "FE_ALREADY_PUBLISHED") return new M1ContractError("ALREADY_PUBLISHED", "This nutrition version is already published.", 409);
  if (message === "FE_NUTRITION_INCOMPLETE") return new M1ContractError("VALIDATION_FAILED", "Add a plan title and at least one meal with its portion before publishing.", 400);
  if (message === "FE_CHECKIN_INCOMPLETE") return new M1ContractError("VALIDATION_FAILED", "Add weight, sleep duration and a valid observation date before submitting.", 400);
  if (message === "FE_INVALID_FOLLOWUP") return new M1ContractError("VALIDATION_FAILED", "Check the follow-up values.", 400);
  return new M1ContractError("TEMPORARILY_UNAVAILABLE", "Follow-up is temporarily unavailable.", 503);
}

function publication(row: Record<string, unknown>) {
  return nutritionPublicationSchema.parse({ id: row.id, clientId: row.client_id, revision: row.revision, draftVersion: row.draft_version, document: row.document, publishedAt: row.published_at });
}
function submission(row: Record<string, unknown>) {
  return checkInSubmissionSchema.parse({ id: row.id, clientId: row.client_id, document: row.document, submittedAt: row.submitted_at });
}
function exactCount(count: number | null) {
  if (count === null || !Number.isSafeInteger(count) || count < 0) throw followupError(null);
  return count;
}

export async function readOwnNutrition() {
  const actor = await requireOwnClientAccess();
  const db = await createServerSupabaseClient();
  const { data, error, count } = await db.from("nutrition_plan_publications")
    .select("id,client_id,revision,draft_version,document,published_at", { count: "exact" })
    .eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId).order("revision", { ascending: false }).limit(50);
  if (error) throw followupError(error);
  const history = (data ?? []).map(publication);
  return clientNutritionResponseSchema.parse({ publication: history[0] ?? null, history, historyTruncated: exactCount(count) > history.length });
}

export async function readCoachNutrition(clientId: string) {
  await requireCoachVerified(); const db = await createServerSupabaseClient();
  const { data, error } = await db.rpc("get_followup_for_coach", { p_client_id: uuidSchema.parse(clientId), p_kind: "nutrition", p_page: 0 });
  if (error) throw followupError(error);
  return coachNutritionResponseSchema.parse(data);
}
export async function mutateCoachNutrition(clientId: string, input: NutritionMutation) {
  await requireCoachVerified(); const db = await createServerSupabaseClient();
  const { error } = await db.rpc("mutate_coach_nutrition", { p_client_id: uuidSchema.parse(clientId), p_input: nutritionMutationSchema.parse(input) });
  if (error) throw followupError(error);
  return readCoachNutrition(clientId);
}

export async function readOwnCheckIns(page = 0) {
  if (!Number.isInteger(page) || page < 0 || page > 10000) throw new M1ContractError("VALIDATION_FAILED", "Invalid history page.", 400);
  const actor = await requireOwnClientAccess(); const db = await createServerSupabaseClient();
  const [draftResult, historyResult] = await Promise.all([
    db.from("client_checkin_drafts").select("document,row_version,updated_at,active").eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId).maybeSingle(),
    db.from("client_checkin_submissions").select("id,client_id,document,submitted_at", { count: "exact" }).eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId)
      .order("observed_on", { ascending: false }).order("submitted_at", { ascending: false }).order("id", { ascending: true }).range(page * 50, page * 50 + 49),
  ]);
  if (draftResult.error || historyResult.error) throw followupError(draftResult.error ?? historyResult.error);
  const row = draftResult.data;
  const draft = row?.active ? checkInDraftSchema.parse({ version: row.row_version, document: row.document, updatedAt: row.updated_at }) : null;
  const total = exactCount(historyResult.count);
  return checkInsResponseSchema.parse({ version: row?.row_version ?? 0, draft, history: (historyResult.data ?? []).map(submission), page, total, historyTruncated: total > (page + 1) * 50 });
}
export async function mutateOwnCheckIn(input: CheckInMutation) {
  await requireOwnClientAccess(); const db = await createServerSupabaseClient();
  const { error } = await db.rpc("mutate_own_checkin", { p_input: checkInMutationSchema.parse(input) });
  if (error) throw followupError(error);
  return readOwnCheckIns();
}
export async function readCoachCheckIns(clientId: string, page = 0) {
  await requireCoachVerified(); const db = await createServerSupabaseClient();
  const { data, error } = await db.rpc("get_followup_for_coach", { p_client_id: uuidSchema.parse(clientId), p_kind: "check-ins", p_page: page });
  if (error) throw followupError(error);
  return coachCheckInsResponseSchema.parse(data);
}

export async function readOwnProgression() {
  const actor = await requireOwnClientAccess(); const db = await createServerSupabaseClient();
  const [wz, checkins, workouts] = await Promise.all([
    db.from("week_zero_acquisitions").select("responses,submitted_at").eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId).eq("status", "SUBMITTED").maybeSingle(),
    db.from("client_checkin_submissions").select("id,client_id,document,submitted_at", { count: "exact" }).eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId)
      .order("observed_on", { ascending: false }).order("submitted_at", { ascending: false }).order("id", { ascending: true }).limit(200),
    db.from("training_session_results").select("completed_at", { count: "exact" }).eq("organization_id", actor.organizationId).eq("client_id", actor.ownClientId).eq("status", "COMPLETED")
      .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(200),
  ]);
  if (wz.error || checkins.error || workouts.error) throw followupError(wz.error ?? checkins.error ?? workouts.error);
  let baseline = null;
  if (wz.data) {
    const measurements = weekZeroAcquisitionResponsesSchema.parse(wz.data.responses).measurements;
    baseline = { source: "WEEK_ZERO" as const, recordedAt: wz.data.submitted_at, measurements: Object.fromEntries(Object.keys(EMPTY_CHECK_IN_MEASUREMENTS).map(key => [key, measurements[key as keyof typeof measurements] ?? null])) };
  }
  const checkInsTotal = exactCount(checkins.count); const completedTotal = exactCount(workouts.count);
  return progressionResponseSchema.parse({ baseline, checkIns: (checkins.data ?? []).map(submission), checkInsTruncated: checkInsTotal > 200, checkInsTotal,
    completedWorkouts: { total: completedTotal, dates: (workouts.data ?? []).map(row => row.completed_at), datesTruncated: completedTotal > 200 } });
}
