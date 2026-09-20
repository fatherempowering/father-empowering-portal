import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CoachEmailVerificationCard } from "@/features/coach/auth/coach-email-verification-card";
import { getServerActor, requireCoachVerified } from "@/lib/auth/actor";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérification Coach | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");

  try {
    await requireCoachVerified();
    redirect("/coach");
  } catch (error) {
    if (!(error instanceof M1ContractError) || error.code !== "FORBIDDEN") {
      throw error;
    }
  }

  return <CoachEmailVerificationCard />;
}
