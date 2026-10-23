import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { requireOwnClientAccess } from "@/lib/auth/own-client-access";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import { publicationClientsSchema, publicationSchema, publicationResponseSchema, publishProgramRequestSchema, type PublishProgramRequest } from "@/lib/contracts/training-publication";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { programRepositoryError } from "./program-repository";

export function publicationError(error: { message: string } | null) {
  if (error?.message === "FE_PILOT_RECIPIENT_DISABLED") return new M1ContractError("VALIDATION_FAILED", "Ce lot pilote est réservé aux comptes clients autorisés pour le test staging.", 400);
  if (error?.message === "FE_INVALID_TRAINING_PUBLICATION") return new M1ContractError("VALIDATION_FAILED", "Complete the program before publishing", 400);
  if (error?.message === "FE_ALREADY_PUBLISHED") return new M1ContractError("VERSION_CONFLICT", "This draft version was already published", 409);
  return programRepositoryError(error);
}
export async function listTrainingRecipients(page: number) {
  await requireCoachVerified();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_training_recipients", { p_page: page });
  if (error) throw publicationError(error);
  return publicationClientsSchema.parse(data);
}
async function readCurrent(organizationId: string, clientId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("training_program_publications")
    .select("id,client_id,program_id,draft_version,revision,document,published_at")
    .eq("organization_id", organizationId).eq("client_id", clientId)
    .order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error) throw publicationError(error);
  return data ? publicationSchema.parse({ id: data.id, clientId: data.client_id, programId: data.program_id,
    draftVersion: data.draft_version, revision: data.revision, document: data.document, publishedAt: data.published_at }) : null;
}
export async function readCoachPublication(clientId: string) {
  await requireCoachVerified();
  const id = uuidSchema.parse(clientId);
  const supabase = await createServerSupabaseClient();
  // Distinguish a genuinely empty publication history from lost authorization.
  // Broader dossier access alone is not sufficient (e.g. a paused assignment).
  const { data, error } = await supabase.rpc("get_training_publication_for_coach", { p_client_id: id });
  if (error) throw publicationError(error);
  return publicationResponseSchema.parse(data).program;
}
export async function readOwnPublication() {
  const actor = await requireOwnClientAccess();
  return readCurrent(actor.organizationId, actor.ownClientId);
}
export async function publishProgram(input: PublishProgramRequest) {
  await requireCoachVerified();
  const parsed = publishProgramRequestSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("publish_training_program", {
    p_client_id: parsed.clientId, p_program_id: parsed.programId, p_draft_version: parsed.draftVersion,
    p_expected_publication_id: parsed.expectedPublicationId, p_idempotency_key: parsed.clientMutationId,
  });
  if (error) throw publicationError(error);
  return publicationSchema.parse(data);
}
