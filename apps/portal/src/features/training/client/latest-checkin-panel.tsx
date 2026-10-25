"use client";

import { useEffect, useState } from "react";
import { checkInsResponseSchema, type CheckInSubmission } from "@/lib/contracts/client-followup";
import styles from "./client-reference-panel.module.css";

export async function readLatestCheckIn(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/v1/client/check-ins?page=0", { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (response.status === 401 || response.status === 403) throw new Error("AUTH_REQUIRED");
  if (!response.ok) throw new Error("UNAVAILABLE");
  const body = await response.json();
  return checkInsResponseSchema.parse(body?.data).history[0] ?? null;
}

export function LatestCheckInPanel({ french, onAuthRequired }: { french: boolean; onAuthRequired(): void }) {
  const [latest, setLatest] = useState<CheckInSubmission | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let active = true;
    setStatus("loading"); setLatest(null);
    readLatestCheckIn(controller.signal).then(value => { if (active) { setLatest(value); setStatus("ready"); } })
      .catch(error => { if (!active) return; if (error instanceof Error && error.message === "AUTH_REQUIRED") onAuthRequired(); setStatus("error"); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt, onAuthRequired]);
  const t = (fr: string, en: string) => french ? fr : en;
  const value = latest?.document;
  const kpis = [
    { symbol: "⚖", label: t("Poids", "Bodyweight"), unit: "lb", value: value?.measurements.bodyWeightLb },
    { symbol: "☾", label: t("Sommeil", "Sleep"), unit: "h", value: value?.sleepHours },
    { symbol: "ϟ", label: t("Énergie", "Energy"), unit: "/10", value: value?.energy },
    { symbol: "◎", label: t("Stress", "Stress"), unit: "/10", value: value?.stress },
    { symbol: "✚", label: t("Courbatures", "Soreness"), unit: "/10", value: value?.soreness },
    { symbol: "♡", label: "Cardio", unit: "min", value: value?.cardioMinutes },
  ];
  return <section aria-label={t("Dernier check-in", "Last check-in")}>
    <div className={styles.sectionDivider}><span /><h2>{t("Dernier check-in", "Last check-in")}</h2><span /></div>
    <div className={styles.kpiGrid}>{kpis.map(kpi => <div className={styles.kpiCard} key={kpi.label} data-testid="reference-checkin-kpi">
      <div className={styles.kpiLabel}><span aria-hidden="true">{kpi.symbol}</span>{kpi.label}</div>
      <div className={styles.kpiValue}>{kpi.value == null ? "—" : new Intl.NumberFormat(french ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(kpi.value)} <small>{kpi.unit}</small></div>
    </div>)}</div>
    {status === "loading" ? <p className={styles.checkinNote} role="status">{t("Chargement du dernier check-in…", "Loading your latest check-in…")}</p> : status === "error" ? <div className={styles.state} role="alert"><p>{t("Le dernier check-in n’a pas pu être chargé.", "Your latest check-in could not be loaded.")}</p><button onClick={() => setAttempt(value => value + 1)}>{t("Réessayer", "Try again")}</button></div> : <p className={styles.checkinNote}>{latest ? <>{t("Dernier bilan transmis · observations du ", "Latest submitted check-in · observed on ")}<time dateTime={latest.document.observedOn}>{new Date(`${latest.document.observedOn}T12:00:00Z`).toLocaleDateString(french ? "fr-CA" : "en-CA", { timeZone: "UTC" })}</time></> : t("Aucun check-in transmis pour le moment.", "No check-in submitted yet.")}</p>}
    <a className={styles.referenceLink} href={`/client/check-in?language=${french ? "fr" : "en"}`}>{t("Faire mon check-in", "Complete my check-in")}</a>
  </section>;
}
