import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getServerActor } from "@/lib/auth/actor";
import { getStaffPersonalProfile } from "@/lib/auth/own-client-access";
import { PortalAccessProvider } from "@/components/fe/portal-access-context";
import { RegisterClientShell } from "@/features/client/pwa/register-client-shell";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Father Empowering Portal",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  referrer: "same-origin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FE Portal",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const actor = await getServerActor();
  if (!actor) redirect("/client-login");
  if (actor.role !== "CLIENT") {
    try {
      const { profile } = await getStaffPersonalProfile();
      if (!profile || profile.status !== "ACTIVE") redirect("/coach/personal");
    } catch (error) {
      if (error instanceof M1ContractError && error.code === "FORBIDDEN") {
        redirect("/verify-email");
      }
      if (error instanceof M1ContractError && error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      throw error;
    }
  }

  return (
    <PortalAccessProvider isStaff={actor.role !== "CLIENT"}>
      <RegisterClientShell />
      {children}
    </PortalAccessProvider>
  );
}
