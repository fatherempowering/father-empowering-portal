import { redirect } from "next/navigation";
import { ProgramBuilder } from "@/features/training/coach/program-builder";
import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
export const dynamic = "force-dynamic";
export default async function CoachProgramsPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  try { await requireCoachVerified(); }
  catch (error) {
    if (error instanceof M1ContractError && error.code === "FORBIDDEN") redirect("/verify-email");
    if (error instanceof M1ContractError && error.code === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
  return <ProgramBuilder />;
}
