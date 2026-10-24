import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { uuidSchema } from "@/lib/contracts/m1";
import { programListQuerySchema, programSnapshotSchema } from "@/lib/contracts/training-drafts";
import { programHistorySchema, programVersionSchema } from "@/lib/contracts/training-history";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { programRepositoryError } from "./program-repository";

export async function listProgramHistory(id: string, page: number) {
  await requireCoachVerified();
  const programId = uuidSchema.parse(id);
  const query = programListQuerySchema.parse({ page });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("read_training_program_history", { p_program_id: programId, p_version: null, p_page: query.page });
  if (error) throw programRepositoryError(error);
  return programHistorySchema.parse(data);
}
export async function getProgramHistoryVersion(id: string, version: number) {
  await requireCoachVerified();
  const programId = uuidSchema.parse(id); const parsedVersion = programVersionSchema.parse(version);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("read_training_program_history", { p_program_id: programId, p_version: parsedVersion, p_page: 0 });
  if (error) throw programRepositoryError(error);
  const snapshot = programSnapshotSchema.parse(data);
  if (snapshot.id !== programId || snapshot.version !== parsedVersion) throw programRepositoryError(null);
  return snapshot;
}
