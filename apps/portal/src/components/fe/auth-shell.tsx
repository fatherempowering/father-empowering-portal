import type { ReactNode } from "react";
import { Brand } from "./brand";

export function AuthShell({
  children,
  locale = "fr",
}: {
  children: ReactNode;
  locale?: "fr" | "en";
}) {
  return (
    <div className="fe-auth-page" lang={locale}>
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
          <div className="fe-auth-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
