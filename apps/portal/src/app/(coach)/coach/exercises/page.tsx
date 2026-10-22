import { redirect } from "next/navigation";

import { ExerciseLibrary } from "@/features/training/coach/exercise-library";
import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export default async function CoachExercisesPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  try { await requireCoachVerified(); }
  catch (error) {
    if (error instanceof M1ContractError && error.code === "FORBIDDEN") redirect("/verify-email");
    if (error instanceof M1ContractError && error.code === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
  return <ExerciseLibrary />;
}
