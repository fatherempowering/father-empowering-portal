import type { Metadata } from "next";

import { CoachPasswordRecoveryCard } from "@/features/coach/auth/coach-password-recovery-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mot de passe Coach | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ForgotPasswordPage() {
  return <CoachPasswordRecoveryCard />;
}
