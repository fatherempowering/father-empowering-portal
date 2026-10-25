"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicationSchema, type ProgramPublication } from "@/lib/contracts/training-publication";
import { programEditorSchema } from "@/lib/contracts/training-drafts";
import { workoutSessionResponseSchema, workoutSnapshotSchema, type WorkoutSnapshot } from "@/lib/contracts/training-results";
import styles from "./client-training-metrics.module.css";

type TrainingWeek = ProgramPublication["document"]["weeks"][number];
type MassUnit = "lb" | "kg";
type UnitMetrics = { volume: number | null; totalLoad: number | null; measuredSets: number };
type SessionMetrics = { sessionId: string; title: { fr: string; en: string }; units: Record<MassUnit, UnitMetrics> };
export type ClientWeekMetrics = {
  weekNumber: number; sessions: SessionMetrics[]; units: Record<MassUnit, UnitMetrics>; measuredSets: number;
};
type SessionReading = { sessionId: string; workout: WorkoutSnapshot | null };

export class ClientMetricsReadError extends Error {
  constructor(readonly code: "AUTH_REQUIRED" | "UNAVAILABLE") {
    super(code);
    this.name = "ClientMetricsReadError";
  }
}
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const emptyUnits = (): Record<MassUnit, UnitMetrics> => ({
  lb: { volume: null, totalLoad: null, measuredSets: 0 },
  kg: { volume: null, totalLoad: null, measuredSets: 0 },
});
const measuredSum = (previous: number | null, value: number) => Number(((previous ?? 0) + value).toFixed(6));

/** Recorded mass only. No prescribed targets, unit conversion or unilateral multiplier. */
export function calculateClientWeekMetrics(week: TrainingWeek, readings: SessionReading[]): ClientWeekMetrics {
  week = programEditorSchema.shape.weeks.element.parse(week);
  if (readings.length !== week.sessions.length || new Set(readings.map(row => row.sessionId.toLowerCase())).size !== readings.length) throw new ClientMetricsReadError("UNAVAILABLE");
  const units = emptyUnits();
  const sessions = week.sessions.map(session => {
    const reading = readings.find(row => sameId(row.sessionId, session.id));
    if (!reading) throw new ClientMetricsReadError("UNAVAILABLE");
    const perSession = emptyUnits();
    if (reading.workout) {
      const workout = workoutSnapshotSchema.parse(reading.workout);
      if (workout.weekNumber !== week.number || !sameId(workout.sessionId, session.id) || JSON.stringify(workout.session) !== JSON.stringify(session)) throw new ClientMetricsReadError("UNAVAILABLE");
      const identities = workout.sets.map(set => `${set.exerciseId.toLowerCase()}:${set.setNumber}`);
      if (new Set(identities).size !== identities.length) throw new ClientMetricsReadError("UNAVAILABLE");
      for (const set of workout.sets) {
        if (set.status !== "DONE" || (set.unit !== "lb" && set.unit !== "kg")) continue;
        // Schema validation already requires both values; retain a fail-closed
        // guard here rather than ever treating an unknown measurement as zero.
        if (set.load === null || set.reps === null) throw new ClientMetricsReadError("UNAVAILABLE");
        const target = perSession[set.unit];
        target.volume = measuredSum(target.volume, set.load * set.reps);
        target.totalLoad = measuredSum(target.totalLoad, set.load);
        target.measuredSets++;
      }
    }
    for (const unit of ["lb", "kg"] as const) {
      if (perSession[unit].measuredSets === 0) continue;
      units[unit].volume = measuredSum(units[unit].volume, perSession[unit].volume!);
      units[unit].totalLoad = measuredSum(units[unit].totalLoad, perSession[unit].totalLoad!);
      units[unit].measuredSets += perSession[unit].measuredSets;
    }
    return { sessionId: session.id, title: session.title, units: perSession };
  });
  return { weekNumber: week.number, sessions, units, measuredSets: units.lb.measuredSets + units.kg.measuredSets };
}

/** Uses the authenticated Client read API, at most three concurrent requests. */
export async function readClientWeekMetrics(program: ProgramPublication, week: TrainingWeek, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const frozen = publicationSchema.parse(program);
  const selectedWeek = frozen.document.weeks.find(candidate => candidate.number === week.number);
  if (!selectedWeek || JSON.stringify(selectedWeek) !== JSON.stringify(programEditorSchema.shape.weeks.element.parse(week))) throw new ClientMetricsReadError("UNAVAILABLE");
  const readings: SessionReading[] = new Array(selectedWeek.sessions.length);
  let cursor = 0;
  let stopped = false;
  async function readNext() {
    while (!stopped && cursor < selectedWeek!.sessions.length) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const index = cursor++;
      const session = selectedWeek!.sessions[index];
      const query = new URLSearchParams({ publicationId: frozen.id, weekNumber: String(selectedWeek!.number), sessionId: session.id });
      try {
        const response = await fetcher(`/api/v1/client/workouts/session?${query}`, {
          cache: "no-store", credentials: "same-origin", redirect: "error", signal,
        });
        if (response.status === 401 || response.status === 403) throw new ClientMetricsReadError("AUTH_REQUIRED");
        if (!response.ok) throw new ClientMetricsReadError("UNAVAILABLE");
        const loaded = workoutSessionResponseSchema.parse((await response.json()).data);
        const returnedWeek = loaded.publication.document.weeks.find(candidate => candidate.number === selectedWeek!.number);
        if (!sameId(loaded.publication.id, frozen.id) || !sameId(loaded.publication.clientId, frozen.clientId) ||
            !sameId(loaded.publication.programId, frozen.programId) || loaded.publication.revision !== frozen.revision ||
            JSON.stringify(returnedWeek) !== JSON.stringify(selectedWeek) || (loaded.workout &&
              (!sameId(loaded.workout.sessionId, session.id) || loaded.workout.weekNumber !== selectedWeek!.number))) throw new ClientMetricsReadError("UNAVAILABLE");
        readings[index] = { sessionId: session.id, workout: loaded.workout };
      } catch (error) { stopped = true; throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, selectedWeek.sessions.length) }, readNext));
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return calculateClientWeekMetrics(selectedWeek, readings);
}

function MetricChart({ metrics, unit, metric, french }: {
  metrics: ClientWeekMetrics; unit: MassUnit; metric: "volume" | "totalLoad"; french: boolean;
}) {
  const maximum = Math.max(0, ...metrics.sessions.map(session => session.units[unit][metric] ?? 0));
  const formatter = new Intl.NumberFormat(french ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 });
  return <div className={styles.chart}>
    <div className={styles.chartUnit}>{unit}{metric === "volume" ? (french ? " × rép." : " × reps") : ""}</div>
    <ol className={styles.bars} style={{ gridTemplateColumns: `repeat(${Math.max(1, metrics.sessions.length)}, minmax(28px, 1fr))` }} aria-label={french ? `Valeurs enregistrées par séance en ${unit}` : `Recorded values by session in ${unit}`}>
      {metrics.sessions.map((session, index) => {
        const value = session.units[unit][metric];
        const label = session.title[french ? "fr" : "en"] || session.title[french ? "en" : "fr"] || `${french ? "Séance" : "Session"} ${index + 1}`;
        return <li key={session.sessionId} title={`${label} · ${value === null ? (french ? "aucune mesure" : "no measurement") : `${formatter.format(value)} ${unit}${metric === "volume" ? " × reps" : ""}`}`}>
          <span className={styles.barValue}>{value === null ? "—" : formatter.format(value)}</span>
          <div className={styles.barTrack} aria-hidden="true">{value !== null && <span className={styles.bar} style={{ height: `${maximum > 0 ? value / maximum * 100 : 0}%` }} />}</div>
          <span className={styles.barLabel}>{index + 1}</span>
          <span className={styles.srOnly}>{label}: {value === null ? (french ? "aucune mesure enregistrée" : "no recorded measurement") : `${formatter.format(value)} ${unit}${metric === "volume" ? " × reps" : ""}`}</span>
        </li>;
      })}
    </ol>
  </div>;
}

export function ClientTrainingMetricsContent({ metrics, weekNumber, french, loading = false, failed = false, onRetry }: {
  metrics: ClientWeekMetrics | null; weekNumber: number; french: boolean; loading?: boolean; failed?: boolean; onRetry: () => void;
}) {
  const t = (fr: string, en: string) => french ? fr : en;
  const formatter = new Intl.NumberFormat(french ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 });
  const knownUnits = (["lb", "kg"] as const).filter(unit => metrics && metrics.units[unit].measuredSets > 0);
  return <div className={styles.grid} data-testid="client-training-metrics" aria-label={t("Mes résultats de la semaine", "My weekly results")}>
    {(["volume", "totalLoad"] as const).map(metric => <section className={styles.card} key={metric} aria-label={metric === "volume" ? t("Volume d’entraînement", "Training volume") : t("Charge totale", "Total load")}>
      <div className={styles.header}><h2>{metric === "volume" ? t("Volume d’entraînement", "Training volume") : t("Charge totale", "Total load")}</h2><span>{metric === "volume" ? t("CHARGE × RÉP.", "LOAD × REPS") : t("CHARGES SAISIES", "RECORDED LOADS")}</span></div>
      <div className={styles.total}>
        {loading || failed || !knownUnits.length ? "—" : knownUnits.map(unit => <div key={unit}>{formatter.format(metrics!.units[unit][metric]!)} <small>{unit}{metric === "volume" ? t(" × rép.", " × reps") : ""}</small></div>)}
      </div>
      <p className={styles.subtitle}>{t(`Semaine ${weekNumber}`, `Week ${weekNumber}`)} · {loading ? t("Chargement…", "Loading…") : failed ? t("Indisponible", "Unavailable") : metrics?.measuredSets ? t(`${metrics.measuredSets} série${metrics.measuredSets > 1 ? "s" : ""} mesurée${metrics.measuredSets > 1 ? "s" : ""}`, `${metrics.measuredSets} measured set${metrics.measuredSets > 1 ? "s" : ""}`) : t("Aucune série de charge enregistrée", "No recorded mass-based set")}</p>
      {!loading && !failed && metrics && knownUnits.map(unit => <MetricChart key={unit} metrics={metrics} unit={unit} metric={metric} french={french} />)}
      {loading && <p className={styles.empty} role="status">{t("Lecture de tes résultats enregistrés…", "Reading your saved results…")}</p>}
      {failed && <div className={styles.empty} role="alert"><p>{t("Impossible de lire ces résultats pour le moment.", "These results cannot be loaded right now.")}</p><button type="button" onClick={onRetry}>{t("Réessayer", "Try again")}</button></div>}
      {!loading && !failed && !knownUnits.length && <p className={styles.empty}>{t("Les séries enregistrées avec une charge en lb ou kg apparaîtront ici.", "Saved sets with a load in lb or kg will appear here.")}</p>}
      <p className={styles.method}>{metric === "volume" ? t("Somme des charges × répétitions réellement enregistrées. Aucun doublement par bras ou par côté.", "Sum of recorded loads × repetitions. No doubling per arm or side.") : t("Somme des charges saisies, une fois par série réalisée. Les lb et kg restent séparés.", "Sum of recorded loads, once per completed set. Pounds and kilograms remain separate.")}</p>
    </section>)}
  </div>;
}

export function ClientTrainingMetrics({ program, week, french }: { program: ProgramPublication; week: TrainingWeek; french: boolean }) {
  const key = `${program.id}:${program.revision}:${week.number}`;
  const [state, setState] = useState<{ key: string; status: "loading" | "ready" | "failed" | "auth"; metrics: ClientWeekMetrics | null }>({ key, status: "loading", metrics: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let active = true;
    setState({ key, status: "loading", metrics: null });
    void readClientWeekMetrics(program, week, controller.signal)
      .then(metrics => { if (active) setState({ key, status: "ready", metrics }); })
      .catch(error => {
        controller.abort();
        if (!active) return;
        if (error instanceof ClientMetricsReadError && error.code === "AUTH_REQUIRED") {
          setState({ key, status: "auth", metrics: null });
          window.location.assign("/client-login");
        } else setState({ key, status: "failed", metrics: null });
      })
      .finally(() => { clearTimeout(timeout); controller.abort(); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [program, week, key, attempt]);
  if (state.key === key && state.status === "auth") return <div className={styles.auth} role="alert"><p>{french ? "Reconnecte-toi pour consulter tes résultats privés." : "Sign in again to view your private results."}</p><Link href="/client-login">{french ? "Me reconnecter" : "Sign in again"}</Link></div>;
  return <ClientTrainingMetricsContent french={french} weekNumber={week.number} metrics={state.key === key ? state.metrics : null} loading={state.key !== key || state.status === "loading"} failed={state.key === key && state.status === "failed"} onRetry={() => setAttempt(value => value + 1)} />;
}
