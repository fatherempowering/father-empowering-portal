"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import {
  clientPortalCopy,
  formatClientToday,
} from "./client-portal-presentation";
import type { ClientDashboard as ClientDashboardData } from "./contracts";

const CLIENT_DASHBOARD_TIMEOUT_MS = 8_000;

export function ClientDashboard({
  view = "home",
  loadTimeoutMs = CLIENT_DASHBOARD_TIMEOUT_MS,
}: {
  view?: "home" | "today";
  loadTimeoutMs?: number;
}) {
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
    let mounted = true;
    const timeout = window.setTimeout(() => controller.abort(), loadTimeoutMs);
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
        if (mounted) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, loadTimeoutMs]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const responseReceived = await requestClientLogout(() => {
      setDashboard(null);
      window.location.replace("/client-login");
    });
    if (responseReceived) return;

    setSignOutError(
      dashboard
        ? clientPortalCopy(dashboard).signOutError
        : "Impossible de te déconnecter. Réessaie.",
    );
    setSigningOut(false);
  }

  const french = dashboard?.locale !== "en-CA";
  return (
    <AppShell
      space="client"
      name={dashboard?.displayName}
      locale={french ? "fr" : "en"}
      current={view}
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
        <ClientPortalView
          dashboard={dashboard}
          view={view}
          signingOut={signingOut}
          signOutError={signOutError}
          onSignOut={() => void signOut()}
        />
      )}
    </AppShell>
  );
}

function ClientPortalView({
  dashboard,
  view,
  signingOut,
  signOutError,
  onSignOut,
}: {
  dashboard: ClientDashboardData;
  view: "home" | "today";
  signingOut: boolean;
  signOutError: string | null;
  onSignOut(): void;
}) {
  const copy = clientPortalCopy(dashboard);
  return (
    <>
      <header className="fe-page-heading">
        <div>
          <p className="fe-kicker">The Legacy Protocol</p>
          <h1 className="fe-title">
            {view === "home" ? copy.welcome : copy.todayLabel}
          </h1>
          <p className="fe-intro">
            {view === "home" ? copy.homeIntro : copy.todayIntro}
          </p>
        </div>
        <button
          className="fe-button"
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? copy.signingOut : copy.signOut}
        </button>
      </header>
      {signOutError ? <Feedback>{signOutError}</Feedback> : null}
      {view === "home" ? (
        <ClientHome dashboard={dashboard} />
      ) : (
        <ClientToday dashboard={dashboard} />
      )}
    </>
  );
}

function ClientHome({ dashboard }: { dashboard: ClientDashboardData }) {
  const copy = clientPortalCopy(dashboard);
  return (
    <div className="fe-welcome-grid">
      <section className="fe-welcome-card" aria-labelledby="portal-ready">
        <span
          className="fe-badge fe-badge-active"
          data-status={dashboard.status}
        >
          <Icon name="check" />
          {copy.readyStatus}
        </span>
        <h2 id="portal-ready">{copy.readyTitle}</h2>
        <p>{copy.readyDescription}</p>
        <Link className="fe-button fe-button-primary fe-home-action" href="/client/today">
          {copy.openToday}
          <Icon name="arrow" />
        </Link>
      </section>
      <ClientInformation dashboard={dashboard} />
      <p className="fe-client-signature">Shape your legacy.</p>
    </div>
  );
}

function ClientToday({ dashboard }: { dashboard: ClientDashboardData }) {
  const copy = clientPortalCopy(dashboard);
  return (
    <div className="fe-today-grid">
      <section className="fe-today-card" aria-labelledby="client-next-action">
        <div className="fe-today-card-top">
          <p className="fe-kicker">{copy.nextActionLabel}</p>
          <span className="fe-badge fe-badge-active">
            <Icon name="check" />
            {copy.nextActionStatus}
          </span>
        </div>
        <p className="fe-today-date">{formatClientToday(dashboard)}</p>
        <h2 id="client-next-action">{copy.nextActionTitle}</h2>
        <p>{copy.nextActionDescription}</p>
      </section>
      <ClientInformation dashboard={dashboard} />
      <p className="fe-client-signature">Shape your legacy.</p>
    </div>
  );
}

function ClientInformation({ dashboard }: { dashboard: ClientDashboardData }) {
  const copy = clientPortalCopy(dashboard);
  return (
    <section className="fe-information" aria-labelledby="client-information">
      <h2 id="client-information">{copy.informationTitle}</h2>
      <dl>
        <div className="fe-info-row">
          <dt>{copy.nameLabel}</dt>
          <dd>{dashboard.displayName}</dd>
        </div>
        <div className="fe-info-row">
          <dt>{copy.languageLabel}</dt>
          <dd>{copy.languageValue}</dd>
        </div>
        <div className="fe-info-row">
          <dt>{copy.timezoneLabel}</dt>
          <dd>{dashboard.timezone.replaceAll("_", " ").replaceAll("/", " / ")}</dd>
        </div>
      </dl>
    </section>
  );
}
