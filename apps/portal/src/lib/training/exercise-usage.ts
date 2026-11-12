import { programEditorSchema } from "@/lib/contracts/training-drafts";

export type ExerciseUsageCounts = Record<string, number>;
/** Count saved prescription occurrences, not clicks, sets or client results. */
export function countSavedExerciseUsage(documents: unknown[]): ExerciseUsageCounts {
  const counts: ExerciseUsageCounts = {};
  for (const document of documents) {
    const parsed = programEditorSchema.safeParse(document);
    if (!parsed.success) continue;
    for (const week of parsed.data.weeks) for (const session of week.sessions) for (const block of session.blocks) for (const exercise of block.exercises) {
      const key = exercise.pilot ? `pilot:${exercise.pilot.sourceId}` : `library:${exercise.libraryExerciseId}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}
