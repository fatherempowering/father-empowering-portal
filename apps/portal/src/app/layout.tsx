import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
        <a className="fe-skip-link" href="#main-content">
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
