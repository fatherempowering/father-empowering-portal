"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import { ClientHomePilot } from "./client-home-pilot";
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
  const copy = dashboard ? clientPortalCopy(dashboard) : null;
  if (view === "home") {
    return (
      <ClientHomePilot
        dashboard={dashboard}
        failed={failed}
        signingOut={signingOut}
        signOutError={signOutError}
        onRetry={retry}
        onSignOut={() => void signOut()}
      />
    );
  }
  return (
    <AppShell
      space="client"
      name={dashboard?.displayName}
      locale={french ? "fr" : "en"}
      current={view}
      accountAction={
        <button
          className="fe-button"
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {signingOut
            ? (copy?.signingOut ?? "Déconnexion…")
            : (copy?.signOut ?? "Se déconnecter")}
        </button>
      }
    >
      {signOutError ? <Feedback>{signOutError}</Feedback> : null}
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
        <ClientPortalView dashboard={dashboard} view={view} />
      )}
    </AppShell>
  );
}

function ClientPortalView({
  dashboard,
  view,
}: {
  dashboard: ClientDashboardData;
  view: "home" | "today";
}) {
  return (
    <>
      <ClientContext dashboard={dashboard} view={view} />
      {view === "home" ? (
        <ClientHome dashboard={dashboard} />
      ) : (
        <ClientToday dashboard={dashboard} />
      )}
    </>
  );
}

function ClientHome({ dashboard }: { dashboard: ClientDashboardData }) {
  return (
    <div className="fe-client-home-grid">
      <ClientProgramState dashboard={dashboard} showTodayLink />
      <ClientInformation dashboard={dashboard} />
      <p className="fe-client-signature">Shape your legacy.</p>
    </div>
  );
}

function ClientToday({ dashboard }: { dashboard: ClientDashboardData }) {
  return (
    <div className="fe-today-grid">
      <ClientProgramState
        dashboard={dashboard}
        date={formatClientToday(dashboard)}
      />
      <ClientInformation dashboard={dashboard} />
      <p className="fe-client-signature">Shape your legacy.</p>
    </div>
  );
}

function ClientContext({
  dashboard,
  view,
}: {
  dashboard: ClientDashboardData;
  view: "home" | "today";
}) {
  const copy = clientPortalCopy(dashboard);
  return (
    <header className="fe-client-context">
      <p className="fe-client-context-brand">Father Empowering</p>
      <p className="fe-client-context-protocol">The Legacy Protocol</p>
      <h1>{view === "home" ? copy.welcome : copy.todayLabel}</h1>
      <p>{view === "home" ? copy.homeIntro : copy.todayIntro}</p>
    </header>
  );
}

function ClientProgramState({
  dashboard,
  date,
  showTodayLink = false,
}: {
  dashboard: ClientDashboardData;
  date?: string;
  showTodayLink?: boolean;
}) {
  const copy = clientPortalCopy(dashboard);
  return (
    <section
      className="fe-client-program-state"
      aria-labelledby="client-program-state"
    >
      <div className="fe-client-program-state-top">
        <p className="fe-kicker">{copy.nextActionLabel}</p>
        <span className="fe-badge fe-badge-active">
          <Icon name="check" />
          {copy.nextActionStatus}
        </span>
      </div>
      {date ? <p className="fe-today-date">{date}</p> : null}
      <h2 id="client-program-state">{copy.nextActionTitle}</h2>
      <p>{copy.nextActionDescription}</p>
      {showTodayLink ? (
        <Link className="fe-button fe-home-action" href="/client/today">
          {copy.openToday}
          <Icon name="arrow" />
        </Link>
      ) : null}
    </section>
  );
}

function ClientInformation({ dashboard }: { dashboard: ClientDashboardData }) {
  const copy = clientPortalCopy(dashboard);
  return (
    <section className="fe-information" aria-labelledby="client-information">
      <span
        className="fe-badge fe-badge-active"
        data-status={dashboard.status}
      >
        <Icon name="check" />
        {copy.readyStatus}
      </span>
      <h2 id="client-information">{copy.informationTitle}</h2>
      <p className="fe-information-intro">{copy.readyDescription}</p>
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
