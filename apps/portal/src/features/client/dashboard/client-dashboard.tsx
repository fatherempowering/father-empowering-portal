"use client";

import { useEffect, useState } from "react";

import type { ClientDashboard as ClientDashboardData } from "./contracts";
import styles from "./client-dashboard.module.css";

export function ClientDashboard() {
  const [dashboard, setDashboard] = useState<ClientDashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/v1/client/me", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load client dashboard");
        }

        const payload = (await response.json()) as { client: ClientDashboardData };
        setDashboard(payload.client);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <main className={styles.page}>
        <section className={styles.notice} role="alert">
          <h1>Portail temporairement indisponible</h1>
          <p>Réessaie dans quelques instants.</p>
        </section>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.loading} role="status">Chargement du portail…</div>
      </main>
    );
  }

  const french = dashboard.locale === "fr-CA";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>FATHER EMPOWERING</p>
          <h1>{french ? `Bienvenue, ${dashboard.displayName}` : `Welcome, ${dashboard.displayName}`}</h1>
        </div>
        <span className={styles.status} data-status={dashboard.status}>
          {french ? "Actif" : "Active"}
        </span>
      </header>

      <section className={styles.hero} aria-labelledby="portal-ready">
        <p className={styles.kicker}>LEGACY PROTOCOL</p>
        <h2 id="portal-ready">{french ? "Ton portail est activé." : "Your portal is active."}</h2>
        <p>
          {french
            ? "Ton espace sécurisé est prêt. Les prochaines fonctions seront ajoutées au fil des étapes validées."
            : "Your secure space is ready. New features will appear as each approved milestone is completed."}
        </p>
      </section>

      <section className={styles.grid} aria-label={french ? "État du portail" : "Portal status"}>
        <article>
          <span>{french ? "Compte" : "Account"}</span>
          <strong>{french ? "Connecté" : "Connected"}</strong>
        </article>
        <article>
          <span>{french ? "Accès" : "Access"}</span>
          <strong>{french ? "Privé" : "Private"}</strong>
        </article>
      </section>
    </main>
  );
}
