"use client";

import { useEffect, useState } from "react";
import { Feedback, Loading } from "@/components/fe/feedback";
import { coachWeekZeroAcquisitionSchema } from "@/lib/contracts/week-zero-acquisition";
import type { z } from "zod";
import { formatAssessmentDate } from "./initial-assessment-presentation";
import { acquisitionSections } from "./week-zero-acquisition-presentation";
import styles from "./coach-client-detail.module.css";

type Snapshot = z.infer<typeof coachWeekZeroAcquisitionSchema>;
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; value: Snapshot };

export function CoachWeekZeroAcquisition({ clientId, timezone }: { clientId: string; timezone: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    async function load() {
      try {
        const response = await fetch(`/api/v1/coach/clients/${encodeURIComponent(clientId)}/week-zero/acquisition`, {
          cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401) { window.location.replace("/login"); return; }
        if (response.status === 403) { window.location.replace("/verify-email"); return; }
        if (!response.ok) throw new Error("Unavailable");
        const body: unknown = await response.json();
        const value = coachWeekZeroAcquisitionSchema.parse(
          (body as { data?: { acquisition?: unknown } })?.data?.acquisition,
        );
        if (active) setState({ kind: "ready", value });
      } catch {
        if (active) setState({ kind: "error" });
      } finally { window.clearTimeout(timeout); }
    }
    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [clientId, attempt]);

  const snapshot = state.kind === "ready" ? state.value : null;
  const submitted = snapshot?.status === "SUBMITTED";
  const responses = submitted ? snapshot.responses : null;
  const exceptions = responses
    ? Object.values(responses.loads).filter(load => load.status === "NOT_PERFORMED").length
      + (responses.cardio.status === "NOT_PERFORMED" ? 1 : 0)
    : 0;
  return <section className={styles.assessment} aria-labelledby="week-zero-acquisition-title" aria-busy={state.kind === "loading"} data-testid="coach-week-zero-acquisition">
    <header className={styles.assessmentHeader}>
      <div><p className="fe-kicker">{"Son point de départ"}</p><h2 id="week-zero-acquisition-title">Semaine zéro</h2>
        <p>{"Ses photos, ses mesures, ses charges de départ et ses observations sur le cardio et la mobilité, envoyés ensemble."}</p></div>
      {snapshot && <span className="fe-badge" data-testid="week-zero-acquisition-status">
        {submitted ? exceptions ? "Transmise avec éléments non réalisés" : "Semaine zéro transmise" : "Non transmise"}
      </span>}
    </header>
    {state.kind === "loading" ? <div className={styles.empty}><Loading>Chargement de la semaine zéro…</Loading></div>
      : state.kind === "error" ? <div className={styles.empty}>
        <Feedback>{"On n’a pas pu ouvrir sa semaine zéro. Réessaie pour la consulter."}</Feedback>
        <button type="button" className="fe-button" onClick={() => { setState({ kind: "loading" }); setAttempt(n => n + 1); }}>Réessayer</button>
      </div> : !responses || !snapshot ? <div className={styles.empty}>
        <h3>Aucune semaine zéro complète transmise</h3>
        <p>{"Son brouillon et ses photos restent privés jusqu’à l’envoi. Un ancien bilan partiel ne remplace pas sa semaine zéro complète."}</p>
      </div> : <>
        <div className={styles.empty}>
          <p>Transmise le {formatAssessmentDate(snapshot.submittedAt, timezone) ?? "date indisponible"}. Réponses conservées en lecture seule.</p>
          {exceptions > 0 && <p className={styles.exception}>{exceptions} {"élément(s) non réalisé(s). Les raisons indiquées par le client sont présentées ci-dessous."}</p>}
        </div>
        <div className={styles.photoGrid}>
          {(["front", "side", "back"] as const).map((slot, index) => <PrivatePhoto key={slot}
            src={`/api/v1/coach/clients/${encodeURIComponent(clientId)}/week-zero/photos?slot=${slot}&assetId=${encodeURIComponent(responses.photos[slot] ?? "")}`}
            label={["Face", "Profil", "Dos"][index]} />)}
        </div>
        {responses.photos.notes && <p className={styles.empty}>Notes des photos : {responses.photos.notes}</p>}
        <div className={styles.acquisitionSections}>
          {acquisitionSections(snapshot).map(section => <section key={section.id} className={styles.section} data-testid={`acquisition-${section.id}`}>
            <h3>{section.title}</h3><dl className={styles.values}>{section.items.map(item => <div key={item.label} className={styles.value}>
              <dt>{item.label}</dt><dd>{item.value}</dd>
            </div>)}</dl>
          </section>)}
        </div>
      </>}
  </section>;
}

function PrivatePhoto({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return <figure>
    {failed ? <Feedback>Photo {label.toLowerCase()} indisponible. Recharge le dossier pour réessayer.</Feedback>
      // Authenticated, no-store image proxy: never an external or public Storage URL.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={src} alt={`Photo de départ — ${label.toLowerCase()}`} loading="lazy" onError={() => setFailed(true)} />}
    <figcaption>{label}</figcaption>
  </figure>;
}
