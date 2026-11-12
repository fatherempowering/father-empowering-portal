import "server-only";
import { requireCoachVerified } from "@/lib/auth/actor";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countSavedExerciseUsage, type ExerciseUsageCounts } from "./exercise-usage";

export async function readOwnExerciseUsage(): Promise<{ counts: ExerciseUsageCounts; available: boolean }> {
  // Enforce actor verification before the optional ranking fallback. No service
  // role, cross-coach drafts or client results are used to rank personal choices.
  const actor = await requireCoachVerified();
  const supabase = await createServerSupabaseClient();
  try {
    const documents: unknown[] = [];
    for (let offset = 0; ; offset += 50) {
      // Do not scan unbounded JSON documents during an interactive search. A
      // large history uses the explicit alphabetical fallback, never partial counts.
      if (offset >= 200) return { counts: {}, available: false };
      const { data, error } = await supabase.from("training_program_drafts").select("id,document")
        .eq("organization_id", actor.organizationId).eq("created_by", actor.userId)
        .order("id").range(offset, offset + 49);
      if (error || !data) return { counts: {}, available: false };
      documents.push(...data.map(row => row.document));
      if (data.length < 50) break;
    }
    return { counts: countSavedExerciseUsage(documents), available: true };
  } catch { return { counts: {}, available: false }; }
}
