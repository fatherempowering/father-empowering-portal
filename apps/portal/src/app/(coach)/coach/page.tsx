import { redirect } from "next/navigation";

import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";
import { CoachDashboard } from "@/features/coach/components/coach-dashboard";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  try {
    await requireCoachVerified();
  } catch (error) {
    if (error instanceof M1ContractError && error.code === "FORBIDDEN") {
      redirect("/verify-email");
    }
    throw error;
  }
  return <CoachDashboard />;
}
