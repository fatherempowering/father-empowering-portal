import { redirect } from "next/navigation";

import { getServerActor } from "@/lib/auth/actor";
import { CoachDashboard } from "@/features/coach/components/coach-dashboard";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  if (actor.aal !== "aal2") redirect("/mfa");
  return <CoachDashboard />;
}
