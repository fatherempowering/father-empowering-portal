import { redirect } from "next/navigation";
import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import { CoachWorkoutResults } from "@/features/training/coach/workout-results";
export const dynamic = "force-dynamic";
export default async function CoachWorkoutPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  try { await requireCoachVerified(); }
  catch (error) {
    if (error instanceof M1ContractError && error.code === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof M1ContractError && error.code === "FORBIDDEN") redirect("/verify-email");
    throw error;
  }
  const parsed = uuidSchema.safeParse((await params).clientId);
  if (!parsed.success) redirect("/coach");
  return <CoachWorkoutResults clientId={parsed.data} />;
}
