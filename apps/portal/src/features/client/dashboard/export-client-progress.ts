import { clientNutritionResponseSchema, progressionResponseSchema } from "@/lib/contracts/client-followup";
import { publicationResponseSchema } from "@/lib/contracts/training-publication";

/** Explicit allowlist: no raw response, auth state, photo URL or browser storage export. */
export async function exportClientProgress(request: typeof fetch = fetch) {
  const read = async (path: string) => {
    const response = await request(path, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("EXPORT_UNAVAILABLE");
    return (await response.json()).data as unknown;
  };
  const [progression, nutrition, training] = await Promise.all([
    read("/api/v1/client/progression").then(value => progressionResponseSchema.parse(value)),
    read("/api/v1/client/nutrition").then(value => clientNutritionResponseSchema.parse(value)),
    read("/api/v1/client/program").then(value => publicationResponseSchema.parse(value)),
  ]);
  return {
    format: "father-empowering-progress-v1",
    exportedAt: new Date().toISOString(),
    scope: "Saved progress and currently available plans. Not a restorable account backup. Photos, unsaved answers and authentication data are excluded.",
    truncated: progression.checkInsTruncated || progression.completedWorkouts.datesTruncated || nutrition.historyTruncated,
    progression, nutrition, training,
  };
}
