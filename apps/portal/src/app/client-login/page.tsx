import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClientLoginCard } from "@/features/client/auth/client-login-card";
import { getServerActor } from "@/lib/auth/actor";

export const metadata: Metadata = {
  title: "Connexion Client | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function ClientLoginPage() {
  const actor = await getServerActor();
  if (actor?.role === "CLIENT") redirect("/client");

  return <ClientLoginCard />;
}
