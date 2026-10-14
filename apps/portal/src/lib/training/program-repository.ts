import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import { programListSchema, programSnapshotSchema, saveProgramRequestSchema, type SaveProgramRequest } from "@/lib/contracts/training-drafts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export function programRepositoryError(error: { message: string } | null) {
  const allowed = [
    ["FE_UNAUTHENTICATED", "UNAUTHENTICATED", 401], ["FE_FORBIDDEN", "FORBIDDEN", 403],
    ["FE_NOT_FOUND", "NOT_FOUND", 404], ["FE_INVALID_TRAINING_DRAFT", "VALIDATION_FAILED", 400],
    ["FE_VERSION_CONFLICT", "VERSION_CONFLICT", 409], ["FE_IDEMPOTENCY_CONFLICT", "DUPLICATE", 409],
  ] as const;
  for (const [marker, code, status] of allowed) if (error?.message === marker) return new M1ContractError(code, "Program operation denied", status);
  return new M1ContractError("TEMPORARILY_UNAVAILABLE", "Programs temporarily unavailable", 503);
}
export async function listProgramDrafts(page: number) {
  const actor = await requireCoachVerified();
  const supabase = await createServerSupabaseClient();
  const { data, error, count } = await supabase.from("training_program_drafts")
    .select("id,title_fr,title_en,row_version,week_count,updated_at", { count: "exact" })
    .eq("organization_id", actor.organizationId).order("updated_at", { ascending: false }).order("id")
    .range(page * 20, page * 20 + 19);
  if (error || !data || count === null) throw programRepositoryError(error);
  return programListSchema.parse({ items: data.map((row) => ({ id: row.id, title: { fr: row.title_fr, en: row.title_en }, version: row.row_version, weekCount: row.week_count, updatedAt: row.updated_at })), total: count, page, pageSize: 20 });
}
export async function getProgramDraft(id: string) {
  const actor = await requireCoachVerified();
  const parsedId = uuidSchema.parse(id);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("training_program_drafts")
    .select("id,document,row_version,created_by,updated_at").eq("organization_id", actor.organizationId).eq("id", parsedId).maybeSingle();
  if (error) throw programRepositoryError(error);
  if (!data) throw new M1ContractError("NOT_FOUND", "Program not found", 404);
  return programSnapshotSchema.parse({ id: data.id, document: data.document, version: data.row_version, createdBy: data.created_by, updatedAt: data.updated_at });
}
export async function saveProgramDraft(input: SaveProgramRequest) {
  await requireCoachVerified();
  const parsed = saveProgramRequestSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_training_program_draft", {
    p_program_id: parsed.id, p_document: parsed.document, p_expected_version: parsed.expectedVersion, p_idempotency_key: parsed.clientMutationId,
  });
  if (error) throw programRepositoryError(error);
  return programSnapshotSchema.parse(data);
}
