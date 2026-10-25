"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { checkInDocumentSchema, checkInsResponseSchema, emptyCheckInDocument, publishableCheckInDocumentSchema, type CheckInDocument, type CheckInMutation, type CheckInSubmission } from "@/lib/contracts/client-followup";
import { FollowupHttpError, followupRequest } from "./followup-http";
import { displayDate, FollowupFrame, FollowupLoadError, FollowupLoading, useFollowupLanguage, useFollowupLifecycle } from "./followup-frame";
import { fromDisplayMeasurement, MEASUREMENT_FIELDS, MEASUREMENT_LABELS, measurementUnit, toDisplayMeasurement, type MeasurementKey } from "./progression-model";
import styles from "./followup.module.css";

type CheckInsData = z.infer<typeof checkInsResponseSchema>;
const ratings = ["sleepQuality", "energy", "stress", "soreness"] as const;
const labels = {
  observedOn: ["Date des observations", "Observation date"], sleepHours: ["Sommeil (heures)", "Sleep (hours)"],
  sleepQuality: ["Qualité du sommeil", "Sleep quality"], energy: ["Énergie", "Energy"], stress: ["Stress", "Stress"], soreness: ["Courbatures", "Soreness"],
  cardioMinutes: ["Cardio (minutes)", "Cardio (minutes)"], cardioZone: ["Zone cardio", "Cardio zone"], notes: ["Ta note pour ton coach", "Your note for your coach"],
} as const;
type Issue = { path: string; observation?: boolean };
const fieldId = (path: string) => `checkin-${path.replaceAll(".", "-")}`;
const fingerprint = (document: CheckInDocument) => JSON.stringify(document);

export function ClientCheckIn() {
  const { french, changeLanguage } = useFollowupLanguage();
  const { pause, resume, signal } = useFollowupLifecycle();
  const t = (fr: string, en: string) => french ? fr : en;
  const [data, setData] = useState<CheckInsData | null>(null);
  const [document, setDocument] = useState<CheckInDocument>(() => emptyCheckInDocument(""));
  const [baseline, setBaseline] = useState(() => fingerprint(emptyCheckInDocument("")));
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), [metric, setMetric] = useState(false);
  const [state, setState] = useState<"saved" | "submitted" | "uncertain" | "conflict" | "error" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]), [historyBusy, setHistoryBusy] = useState(false), [historyFailed, setHistoryFailed] = useState(false);
  const [submission, setSubmission] = useState<CheckInSubmission | null>(null);
  const command = useRef<CheckInMutation | null>(null), inFlight = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const dirty = fingerprint(document) !== baseline;
  const locked = busy || state === "uncertain" || state === "conflict";
  useEffect(() => {
    let active = true; const requestSignal = signal(); setLoading(true); setFailed(false);
    void followupRequest("/api/v1/client/check-ins?page=0", value => checkInsResponseSchema.parse(value), undefined, requestSignal).then(result => {
      if (!active || requestSignal.aborted) return;
      const next = result.draft?.document ?? emptyCheckInDocument("");
      setData(result); setDocument(next); setBaseline(fingerprint(next)); setState(null); command.current = null;
    }).catch(() => { if (active && !requestSignal.aborted) setFailed(true); }).finally(() => { if (active && !requestSignal.aborted) setLoading(false); });
    return () => { active = false; };
  }, [attempt, signal]);
  function fieldLabel(path: string) {
    if (path.startsWith("measurements.")) return MEASUREMENT_LABELS[path.slice(13) as MeasurementKey]?.[french ? 0 : 1] ?? t("Mesure", "Measurement");
    return labels[path as keyof typeof labels]?.[french ? 0 : 1] ?? t("Observation", "Observation");
  }
  function focusIssue(issue: Issue) {
    const element = window.document.getElementById(fieldId(issue.path || "notes"));
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: "center", behavior: "auto" });
  }
  function update<K extends keyof CheckInDocument>(key: K, value: CheckInDocument[K]) { setDocument(previous => ({ ...previous, [key]: value })); setState(null); setIssues([]); }
  function updateMeasurement(key: MeasurementKey, raw: string) {
    update("measurements", { ...document.measurements, [key]: raw === "" ? null : fromDisplayMeasurement(Number(raw), key, metric) });
  }
  async function mutate(action: "save" | "submit", retry = false) {
    if (!data || inFlight.current || historyBusy || signal().aborted) return;
    if (!retry) {
      const parsed = (action === "submit" ? publishableCheckInDocumentSchema : checkInDocumentSchema).safeParse(document);
      if (!parsed.success) {
        setIssues([...new Set(parsed.error.issues.map(issue => issue.path.map(String).join(".")))].map(path => ({ path })));
        requestAnimationFrame(() => errorSummary.current?.focus()); return;
      }
      if (action === "submit" && (dirty || !data.draft)) return;
      command.current = action === "save"
        ? { action, document: parsed.data, expectedVersion: data.version, clientMutationId: crypto.randomUUID() }
        : { action, expectedVersion: data.version, clientMutationId: crypto.randomUUID() };
    }
    const pending = command.current;
    if (!pending) return;
    const requestSignal = signal();
    inFlight.current = true; setBusy(true); setIssues([]);
    try {
      const result = await followupRequest("/api/v1/client/check-ins", value => checkInsResponseSchema.parse(value), pending, requestSignal);
      if (requestSignal.aborted) throw new FollowupHttpError("CANCELLED");
      if (pending.action === "save" && !result.draft) throw new FollowupHttpError("RESPONSE");
      if (pending.action === "submit" && result.draft) throw new FollowupHttpError("RESPONSE");
      const next = result.draft?.document ?? emptyCheckInDocument("");
      setData(result); setDocument(next); setBaseline(fingerprint(next)); setState(pending.action === "save" ? "saved" : "submitted"); setSubmission(null); command.current = null;
    } catch (error) {
      if (error instanceof FollowupHttpError && [401, 403].includes(Number(error.status))) return;
      if (error instanceof FollowupHttpError && error.status === 409) { setState("conflict"); command.current = null; }
      else if (error instanceof FollowupHttpError && [400, 404, 422].includes(Number(error.status))) { setState("error"); command.current = null; }
      else setState("uncertain");
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function historyPage(page: number) {
    if (historyBusy || busy || signal().aborted) return;
    const requestSignal = signal();
    setHistoryBusy(true); setHistoryFailed(false);
    try { const next = await followupRequest(`/api/v1/client/check-ins?page=${page}`, value => checkInsResponseSchema.parse(value), undefined, requestSignal); if (requestSignal.aborted) return; setData(previous => previous ? { ...previous, history: next.history, historyTruncated: next.historyTruncated, page: next.page, total: next.total } : next); setSubmission(null); }
    catch { setHistoryFailed(true); }
    finally { setHistoryBusy(false); }
  }
  const issueFor = (path: string) => issues.some(issue => issue.path === path);
  return <FollowupFrame current="check-in" title={t("Fais le point.", "Check in with yourself.")} subtitle={t("Des observations simples, pour ajuster la suite avec ton coach.", "Simple observations to plan the next steps with your coach.")} french={french} changeLanguage={changeLanguage} dirty={dirty || state === "uncertain"} onBeforeLogout={pause} onLogoutFailure={() => { resume(); if (!data && !dirty && !command.current && !inFlight.current) setAttempt(value => value + 1); else if (data) setLoading(false); }}>
    {loading ? <FollowupLoading french={french} /> : failed || !data ? <FollowupLoadError french={french} retry={() => setAttempt(value => value + 1)} /> : <>
      {state ? <div className={state === "saved" || state === "submitted" ? styles.success : styles.error} role={state === "saved" || state === "submitted" ? "status" : "alert"}>
        {state === "saved" ? t("Brouillon enregistré. Tu peux encore le modifier avant de le transmettre.", "Draft saved. You can still edit it before submitting.") : state === "submitted" ? t("Check-in transmis. Ton coach peut maintenant le consulter.", "Check-in submitted. Your coach can now read it.") : state === "uncertain" ? t("La confirmation n’est pas arrivée. Tes saisies restent ici. Réessaie la même opération pour vérifier, sans créer de doublon.", "Confirmation did not arrive. Your entries remain here. Retry the same operation to verify it without a duplicate.") : state === "conflict" ? t("Ce brouillon a changé ailleurs. Tes saisies sont préservées ici. Recharge la version enregistrée pour reprendre.", "This draft changed elsewhere. Your entries are preserved here. Reload the saved version to continue.") : t("Cette opération a été refusée. Vérifie les champs avant de réessayer; rien n’a été annoncé comme enregistré.", "This operation was refused. Check the fields before retrying; nothing has been marked as saved.")}
        {state === "uncertain" ? <button type="button" className={styles.quietButton} disabled={busy} onClick={() => void mutate(command.current?.action ?? "save", true)}>{t("Réessayer pour confirmer", "Retry to confirm")}</button> : null}
        {state === "conflict" ? <button type="button" className={styles.quietButton} onClick={() => { if (window.confirm(t("Recharger remplacera les saisies affichées par la version enregistrée. Continuer ?", "Reloading replaces the displayed entries with the saved version. Continue?"))) setAttempt(value => value + 1); }}>{t("Recharger la version enregistrée", "Reload saved version")}</button> : null}
      </div> : null}
      {issues.length ? <div className={styles.error} role="alert" tabIndex={-1} ref={errorSummary}><strong>{t("Quelques champs sont à vérifier.", "A few fields need checking.")}</strong><ul>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}><button type="button" onClick={() => focusIssue(issue)}>{fieldLabel(issue.path)} — {t("complète ou corrige ce champ", "complete or correct this field")} →</button></li>)}</ul></div> : null}
      <form onSubmit={event => { event.preventDefault(); void mutate("save"); }} noValidate>
        <fieldset className={styles.formFields} disabled={locked}>
          <section className={styles.panel}><h2>{t("Ton point de départ du jour", "Your observations today")}</h2><p className={styles.meta}>{t("Pour transmettre : choisis la date, indique ton poids mesuré et tes heures de sommeil. Les autres champs restent facultatifs.", "To submit: choose the date and enter your measured weight and sleep hours. Other fields are optional.")}</p><div className={styles.formGrid}>
            <label htmlFor={fieldId("observedOn")}>{t("Date des observations", "Observation date")} *<input id={fieldId("observedOn")} type="date" min="2000-01-01" max="2100-12-31" value={document.observedOn} aria-invalid={issueFor("observedOn")} onChange={event => update("observedOn", event.target.value)} /></label>
            <label>{t("Unités de saisie", "Entry units")}<select value={metric ? "metric" : "imperial"} onChange={event => setMetric(event.target.value === "metric")}><option value="imperial">lb / in</option><option value="metric">kg / cm</option></select></label>
          </div></section>
          <section className={styles.panel}><h2>{t("Poids et mensurations", "Weight and body measurements")}</h2><div className={styles.formGrid}>{MEASUREMENT_FIELDS.map(key => {
            const value = document.measurements[key], path = `measurements.${key}`;
            return <label key={key} htmlFor={fieldId(path)}>{MEASUREMENT_LABELS[key][french ? 0 : 1]} ({measurementUnit(key, metric)}) {key === "bodyWeightLb" ? "*" : ""}<input id={fieldId(path)} type="number" inputMode="decimal" step="any" min="0" value={value === null ? "" : Number(toDisplayMeasurement(value, key, metric).toFixed(2))} aria-invalid={issueFor(path)} onChange={event => updateMeasurement(key, event.target.value)} /></label>;
          })}</div><a className={styles.link} href="/client/week-zero">{t("Retrouver mes repères de semaine zéro", "View my Week Zero references")} →</a></section>
          <section className={styles.panel}><h2>{t("Récupération et ressenti", "Recovery and how you feel")}</h2><div className={styles.formGrid}>
            <label htmlFor={fieldId("sleepHours")}>{t("Sommeil (heures)", "Sleep (hours)")} *<input id={fieldId("sleepHours")} type="number" inputMode="decimal" min="0" max="24" step="any" value={document.sleepHours ?? ""} aria-invalid={issueFor("sleepHours")} onChange={event => update("sleepHours", event.target.value === "" ? null : Number(event.target.value))} /></label>
            {ratings.map(key => <label key={key} htmlFor={fieldId(key)}>{labels[key][french ? 0 : 1]} · /10<select id={fieldId(key)} value={document[key] ?? ""} aria-invalid={issueFor(key)} onChange={event => update(key, event.target.value === "" ? null : Number(event.target.value))}><option value="">{t("Non renseigné", "Not provided")}</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><small>{key === "stress" || key === "soreness" ? t("1 = faible · 10 = très élevé", "1 = low · 10 = very high") : t("1 = très faible · 10 = excellent", "1 = very low · 10 = excellent")}</small></label>)}
          </div></section>
          <section className={styles.panel}><h2>Cardio</h2><div className={styles.formGrid}><label htmlFor={fieldId("cardioMinutes")}>{t("Cardio (minutes)", "Cardio (minutes)")}<input id={fieldId("cardioMinutes")} type="number" min="0" max="1440" step="any" value={document.cardioMinutes ?? ""} aria-invalid={issueFor("cardioMinutes")} onChange={event => update("cardioMinutes", event.target.value === "" ? null : Number(event.target.value))} /></label><label htmlFor={fieldId("cardioZone")}>{t("Zone cardio", "Cardio zone")}<select id={fieldId("cardioZone")} value={document.cardioZone ?? ""} onChange={event => update("cardioZone", event.target.value === "" ? null : Number(event.target.value))}><option value="">{t("Non renseignée", "Not provided")}</option>{[1, 2, 3, 4, 5].map(zone => <option key={zone} value={zone}>Zone {zone}</option>)}</select></label></div></section>
          <section className={styles.panel}><h2>{t("Ce que ton coach doit savoir", "What your coach should know")}</h2><label htmlFor={fieldId("notes")}>{t("Ta note pour ton coach", "Your note for your coach")}<textarea id={fieldId("notes")} maxLength={4000} rows={4} value={document.notes} onChange={event => update("notes", event.target.value)} /></label></section>
        </fieldset>
        <div className={styles.actions}><p className={styles.meta}>{busy ? t("Enregistrement…", "Saving…") : dirty ? t("Modifications à enregistrer", "Changes to save") : data.draft ? t("Brouillon enregistré", "Draft saved") : t("Ton prochain check-in", "Your next check-in")}</p><button type="submit" className={styles.quietButton} disabled={locked || historyBusy}>{t("Enregistrer le brouillon", "Save draft")}</button><button type="button" className={styles.button} disabled={locked || historyBusy || dirty || !data.draft} onClick={() => void mutate("submit")}>{t("Transmettre à mon coach", "Submit to my coach")}</button></div>
        {dirty || !data.draft ? <p className={styles.meta}>{t("Enregistre d’abord ton brouillon pour pouvoir le transmettre.", "Save your draft first to submit it.")}</p> : null}
      </form>
      <section className={styles.panel} aria-labelledby="checkin-history"><h2 id="checkin-history">{t("Mes check-ins transmis", "My submitted check-ins")} ({data.total})</h2><p className={styles.meta}>{t("Les check-ins transmis sont conservés en lecture seule.", "Submitted check-ins are preserved as read-only records.")}</p>{historyFailed ? <p className={styles.error} role="alert">{t("Cette page d’historique n’a pas pu être chargée. Réessaie avec les boutons ci-dessous.", "This history page could not be loaded. Retry using the buttons below.")}</p> : null}<div className={styles.history}>{data.history.length ? data.history.map(item => <button type="button" key={item.id} className={styles.historyItem} aria-pressed={submission?.id === item.id} onClick={() => setSubmission(submission?.id === item.id ? null : item)}><strong>{displayDate(item.document.observedOn, french)}</strong><span>{t("Transmis le", "Submitted on")} <time dateTime={item.submittedAt}>{displayDate(item.submittedAt, french)}</time></span><span>{t("Consulter", "View")} →</span></button>) : <p>{t("Aucun check-in transmis pour le moment.", "No check-ins submitted yet.")}</p>}</div>
        {submission ? <CheckInReadOnly submission={submission} french={french} metric={metric} /> : null}
        {data.total > 50 ? <div className={styles.pagination}><button type="button" className={styles.quietButton} disabled={historyBusy || data.page === 0} onClick={() => void historyPage(data.page - 1)}>{t("Précédent", "Previous")}</button><span>{t("Page", "Page")} {data.page + 1}</span><button type="button" className={styles.quietButton} disabled={historyBusy || (data.page + 1) * 50 >= data.total} onClick={() => void historyPage(data.page + 1)}>{t("Suivant", "Next")}</button></div> : null}
      </section>
    </>}
  </FollowupFrame>;
}

function CheckInReadOnly({ submission, french, metric }: { submission: CheckInSubmission; french: boolean; metric: boolean }) {
  const document = submission.document, format = (value: number) => new Intl.NumberFormat(french ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value);
  return <section className={styles.submission} aria-label={french ? "Check-in transmis — lecture seule" : "Submitted check-in — read only"}><h3>{displayDate(document.observedOn, french)}</h3><dl>{MEASUREMENT_FIELDS.map(key => document.measurements[key] === null ? null : <div key={key}><dt>{MEASUREMENT_LABELS[key][french ? 0 : 1]}</dt><dd>{format(toDisplayMeasurement(document.measurements[key]!, key, metric))} {measurementUnit(key, metric)}</dd></div>)}{["sleepHours", ...ratings, "cardioMinutes", "cardioZone"].map(key => { const value = document[key as keyof CheckInDocument]; return value === null ? null : <div key={key}><dt>{labels[key as keyof typeof labels][french ? 0 : 1]}</dt><dd>{String(value)}{ratings.includes(key as typeof ratings[number]) ? " /10" : ""}</dd></div>; })}</dl>{document.notes ? <p className={styles.multiline}>{document.notes}</p> : null}</section>;
}
