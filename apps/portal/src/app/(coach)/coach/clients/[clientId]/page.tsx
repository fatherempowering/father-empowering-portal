import { redirect } from "next/navigation";

import { CoachClientDetail } from "@/features/coach/components/coach-client-detail";
import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export default async function CoachClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
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

  const { clientId } = await params;
  return <CoachClientDetail clientId={clientId} />;
}
