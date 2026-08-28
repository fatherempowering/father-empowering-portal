import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth/actor";
import { RegisterClientShell } from "@/features/client/pwa/register-client-shell";

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
  await requireRole("CLIENT");

  return (
    <>
      <RegisterClientShell />
      {children}
    </>
  );
}
