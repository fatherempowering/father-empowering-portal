"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientDashboard as ClientDashboardData } from "./contracts";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";

export function ClientDashboard() {
  const [dashboard, setDashboard] = useState<ClientDashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/v1/client/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/client-login");
          return;
        }
        if (!response.ok) throw new Error("Unable to load client dashboard");
        const payload = (await response.json()) as {
          client: ClientDashboardData;
        };
        setDashboard(payload.client);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch("/api/v1/auth/client-logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { redirectTo?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Unable to sign out.");
      }
      window.location.replace(body.data?.redirectTo ?? "/client-login");
    } catch {
      setSignOutError(
        dashboard?.locale === "en-CA"
          ? "Unable to sign out. Please try again."
          : "Impossible de te déconnecter. Réessaie.",
      );
      setSigningOut(false);
    }
  }

  const french = dashboard?.locale !== "en-CA";
  return (
    <AppShell
      space="client"
      name={dashboard?.displayName}
      locale={french ? "fr" : "en"}
    >
      {failed ? (
        <>
          <h1 className="fe-title">Portail temporairement indisponible</h1>
          <Feedback>
            Impossible de charger ton portail. Vérifie ta connexion et réessaie.
          </Feedback>
          <button className="fe-button" type="button" onClick={retry}>
            Réessayer
          </button>
        </>
      ) : !dashboard ? (
        <Loading>Chargement du portail…</Loading>
      ) : (
        <>
          <header className="fe-page-heading">
            <div>
              <p className="fe-kicker">The Legacy Protocol</p>
              <h1 className="fe-title">
                {french
                  ? `Bienvenue, ${dashboard.displayName}.`
                  : `Welcome, ${dashboard.displayName}.`}
              </h1>
              <p className="fe-intro">
                {french
                  ? "Ton espace Father Empowering."
                  : "Your Father Empowering space."}
              </p>
            </div>
            <button
              className="fe-button"
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              {signingOut
                ? french
                  ? "Déconnexion…"
                  : "Signing out…"
                : french
                  ? "Se déconnecter"
                  : "Sign out"}
            </button>
          </header>
          {signOutError ? <Feedback>{signOutError}</Feedback> : null}
          <div className="fe-welcome-grid">
            <section className="fe-welcome-card" aria-labelledby="portal-ready">
              <span
                className="fe-badge fe-badge-active"
                data-status={dashboard.status}
              >
                <Icon name="check" />
                {french ? "Portail activé" : "Portal activated"}
              </span>
              <h2 id="portal-ready">
                {french ? "Ton point de départ." : "Your starting point."}
              </h2>
              <p>
                {french
                  ? "Ton accès au Legacy Protocol est confirmé."
                  : "Your access to the Legacy Protocol is confirmed."}
                <br />
                {french
                  ? "Pour la suite, suis les indications de Coach Max."
                  : "Follow Coach Max’s guidance for your next steps."}
              </p>
            </section>
            <section
              className="fe-information"
              aria-labelledby="client-information"
            >
              <h2 id="client-information">
                {french ? "Tes informations" : "Your information"}
              </h2>
              <dl>
                <div className="fe-info-row">
                  <dt>{french ? "Nom" : "Name"}</dt>
                  <dd>{dashboard.displayName}</dd>
                </div>
                <div className="fe-info-row">
                  <dt>{french ? "Langue du portail" : "Portal language"}</dt>
                  <dd>{french ? "Français" : "English"}</dd>
                </div>
                <div className="fe-info-row">
                  <dt>{french ? "Fuseau horaire" : "Time zone"}</dt>
                  <dd>
                    {dashboard.timezone
                      .replaceAll("_", " ")
                      .replaceAll("/", " / ")}
                  </dd>
                </div>
              </dl>
            </section>
            <p className="fe-client-signature">Shape your legacy.</p>
          </div>
        </>
      )}
    </AppShell>
  );
}
