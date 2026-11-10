"use client";
import type { ReactNode } from "react";
import { usePortalLanguage } from "./portal-preferences";
import { LanguageControl } from "./preference-controls";
import { Brand } from "./brand";

export function AuthShell({
  children,
  locale = "fr",
}: {
  children: ReactNode;
  locale?: "fr" | "en";
}) {
  const { language } = usePortalLanguage(locale);
  return (
    <div className="fe-auth-page" lang={language}>
      <div className="fe-auth-shell">
        <aside className="fe-auth-brand">
          <Brand />
          <p className="fe-slogan">
            Shape
            <br />
            your <span>legacy.</span>
          </p>
          <p className="fe-brand-footer">The Legacy Protocol</p>
        </aside>
        <main id="main-content" className="fe-auth-main">
          <LanguageControl fallback={locale} />
          <div className="fe-auth-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
