import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CoachPasswordUpdateCard } from "@/features/coach/auth/coach-password-update-card";
import { requireStaffPasswordRecoveryGrant } from "@/lib/auth/staff-password-recovery";
import { STAFF_PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/staff-password-recovery-grant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveau mot de passe Coach | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  try {
    await requireStaffPasswordRecoveryGrant(
      cookieStore.get(STAFF_PASSWORD_RECOVERY_COOKIE)?.value,
    );
  } catch {
    redirect("/login?error=recovery");
  }
  return <CoachPasswordUpdateCard />;
}
