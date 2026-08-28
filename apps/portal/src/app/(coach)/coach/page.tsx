import { requireCoachAal2 } from "@/lib/auth/actor";
import { CoachDashboard } from "@/features/coach/components/coach-dashboard";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  await requireCoachAal2();
  return <CoachDashboard />;
}

