import type { Metadata } from "next";

import { ClientLoginCard } from "@/features/client/auth/client-login-card";

export const metadata: Metadata = {
  title: "Connexion Client | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClientLoginPage() {
  return <ClientLoginCard />;
}
