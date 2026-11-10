"use client";

import { usePortalLanguage } from "@/components/fe/portal-preferences";
import { UiText } from "@/components/fe/ui-text";
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
  const { language, french } = usePortalLanguage(); void french;
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
      <div><p className="fe-kicker">{<UiText>{"Son point de départ"}</UiText>}</p><h2 id="week-zero-acquisition-title"><UiText>Semaine zéro</UiText></h2>
        <p>{<UiText>{"Ses photos, ses mesures, ses charges de départ et ses observations sur le cardio et la mobilité, envoyés ensemble."}</UiText>}</p></div>
      {snapshot && <span className="fe-badge" data-testid="week-zero-acquisition-status">
        {submitted ? exceptions ? <UiText>{"Transmise avec éléments non réalisés"}</UiText> : <UiText>{"Semaine zéro transmise"}</UiText> : <UiText>{"Non transmise"}</UiText>}
      </span>}
    </header>
    {state.kind === "loading" ? <div className={styles.empty}><Loading><UiText>Chargement de la semaine zéro…</UiText></Loading></div>
      : state.kind === "error" ? <div className={styles.empty}>
        <Feedback>{<UiText>{"On n’a pas pu ouvrir sa semaine zéro. Réessaie pour la consulter."}</UiText>}</Feedback>
        <button type="button" className="fe-button" onClick={() => { setState({ kind: "loading" }); setAttempt(n => n + 1); }}><UiText>Réessayer</UiText></button>
      </div> : !responses || !snapshot ? <div className={styles.empty}>
        <h3><UiText>Aucune semaine zéro complète transmise</UiText></h3>
        <p>{<UiText>{"Son brouillon et ses photos restent privés jusqu’à l’envoi. Un ancien bilan partiel ne remplace pas sa semaine zéro complète."}</UiText>}</p>
      </div> : <>
        <div className={styles.empty}>
          <p><UiText>Transmise le </UiText>{formatAssessmentDate(snapshot.submittedAt, timezone, language) ?? <UiText>{"date indisponible"}</UiText>}<UiText>. Réponses conservées en lecture seule.</UiText></p>
          {exceptions > 0 && <p className={styles.exception}>{exceptions} {<UiText>{"élément(s) non réalisé(s). Les raisons indiquées par le client sont présentées ci-dessous."}</UiText>}</p>}
        </div>
        <div className={styles.photoGrid}>
          {(["front", "side", "back"] as const).map((slot, index) => <PrivatePhoto key={slot}
            src={`/api/v1/coach/clients/${encodeURIComponent(clientId)}/week-zero/photos?slot=${slot}&assetId=${encodeURIComponent(responses.photos[slot] ?? "")}`}
            label={(french ? ["Face", "Profil", "Dos"] : ["Front", "Side", "Back"])[index]} />)}
        </div>
        {responses.photos.notes && <p className={styles.empty}><UiText>Notes des photos : </UiText>{responses.photos.notes}</p>}
        <div className={styles.acquisitionSections}>
          {acquisitionSections(snapshot, language).map(section => <section key={section.id} className={styles.section} data-testid={`acquisition-${section.id}`}>
            <h3>{section.title}</h3><dl className={styles.values}>{section.items.map(item => <div key={item.label} className={styles.value}>
              <dt>{item.label}</dt><dd>{item.value}</dd>
            </div>)}</dl>
          </section>)}
        </div>
      </>}
  </section>;
}

function PrivatePhoto({ src, label }: { src: string; label: string }) {
  const { french } = usePortalLanguage();
  const [failed, setFailed] = useState(false);
  return <figure>
    {failed ? <Feedback><UiText>Photo </UiText>{label.toLowerCase()}<UiText> indisponible. Recharge le dossier pour réessayer.</UiText></Feedback>
      // Authenticated, no-store image proxy: never an external or public Storage URL.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={src} alt={`${french ? "Photo de départ" : "Starting photo"} — ${label.toLowerCase()}`} loading="lazy" onError={() => setFailed(true)} />}
    <figcaption>{label}</figcaption>
  </figure>;
}
