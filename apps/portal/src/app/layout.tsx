import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalPreferenceEffects, SkipLink } from "@/components/fe/preference-controls";
import "./globals.css";
import "@/components/fe/portal-settings.css";

export const metadata: Metadata = {
  title: "Father Empowering",
  description: "Father Empowering Portal",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <PortalPreferenceEffects />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
