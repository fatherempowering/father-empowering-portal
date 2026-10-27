"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { PlanWithdrawalDialog } from "@/components/fe/plan-withdrawal-dialog";
import { coachCheckInsResponseSchema, coachNutritionResponseSchema, nutritionMutationSchema, EMPTY_NUTRITION_DOCUMENT,
  type NutritionDocument, type NutritionMutation, type CheckInMeasurements } from "@/lib/contracts/client-followup";
import styles from "./coach-followup.module.css";

type NutritionState = z.infer<typeof coachNutritionResponseSchema>;
type CheckInsState = z.infer<typeof coachCheckInsResponseSchema>;
type Pair = { fr: string; en: string };
const blankPair = (): Pair => ({ fr: "", en: "" });
class FollowupRequestError extends Error { constructor(readonly status: number) { super(outcomeMessage(status)); } }
const observationLabels: Record<keyof CheckInMeasurements, string> = {
  bodyWeightLb: "Poids (lb)", waistIn: "Taille (po)", chestIn: "Poitrine (po)", hipsIn: "Hanches (po)",
  leftArmIn: "Bras gauche (po)", rightArmIn: "Bras droit (po)", leftThighIn: "Cuisse gauche (po)", rightThighIn: "Cuisse droite (po)", leftCalfIn: "Mollet gauche (po)", rightCalfIn: "Mollet droit (po)",
};
const outcomeMessage = (status: number) => status === 409
  ? "Une autre version existe déjà. Recharge l’état avant de reprendre; rien n’a été écrasé."
  : status === 400 ? "Vérifie les champs du plan. Pour publier, il faut un titre et au moins un repas avec son nom et ses portions."
  : status === 404 ? "Ce dossier n’est plus accessible avec ton compte."
  : "Le service est temporairement indisponible. Tes saisies restent ici; réessaie.";

async function request<T>(url: string, schema: z.ZodType<T>, command?: NutritionMutation): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { method: command ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
      headers: { Accept: "application/json", ...(command ? { "Content-Type": "application/json" } : {}) }, ...(command ? { body: JSON.stringify(command) } : {}) });
    if (response.status === 401) { window.location.replace("/login"); throw new Error("Reconnecte-toi pour continuer."); }
    if (response.status === 403) { window.location.replace("/verify-email"); throw new Error("Vérifie ta connexion Coach pour continuer."); }
    if (!response.ok) throw new FollowupRequestError(response.status);
    const body = await response.json();
    const parsed = schema.safeParse(body?.data);
    if (!parsed.success) throw new Error("Le résultat reçu est incomplet. Réessaie pour confirmer l’enregistrement.");
    return parsed.data;
  } catch (error) {
    if (error instanceof FollowupRequestError) throw error;
    throw new Error("La confirmation n’a pas pu être reçue. Vérifie ta connexion, puis réessaie.");
  } finally { window.clearTimeout(timeout); }
}

function PairFields({ id, label, value, onChange, required = false }: {
  id: string; label: string; value: Pair; onChange(value: Pair): void; required?: boolean;
}) {
  return <fieldset className={styles.pair}><legend>{label}{required ? " *" : ""}</legend>
    {(["fr", "en"] as const).map(language => <label key={language} htmlFor={`${id}-${language}`}>{language === "fr" ? "Français" : "English"}
      <textarea id={`${id}-${language}`} value={value[language]} rows={2} maxLength={4000} onChange={event => onChange({ ...value, [language]: event.target.value })} />
    </label>)}
  </fieldset>;
}

export function CoachFollowup({ clientId }: { clientId: string }) {
  const [nutrition, setNutrition] = useState<NutritionState | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInsState | null>(null);
  const [document, setDocument] = useState<NutritionDocument>(() => structuredClone(EMPTY_NUTRITION_DOCUMENT));
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY_NUTRITION_DOCUMENT));
  const [error, setError] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const command = useRef<NutritionMutation | null>(null);
  const inFlight = useRef(false);
  const publishCancel = useRef<HTMLButtonElement>(null);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const withdrawTrigger = useRef<HTMLButtonElement>(null);
  const base = `/api/v1/coach/clients/${encodeURIComponent(clientId)}`;
  const dirty = JSON.stringify(document) !== baseline;
  const draftAlreadyPublished = Boolean(nutrition?.draft && [nutrition.publication, ...nutrition.history].some(item => item?.draftVersion === nutrition.draft!.version));

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(null); setCheckInError(null);
    Promise.allSettled([request(`${base}/nutrition`, coachNutritionResponseSchema), request(`${base}/check-ins?page=0`, coachCheckInsResponseSchema)])
      .then(([plan, history]) => {
        if (!mounted) return;
        if (plan.status === "fulfilled") {
          const next = plan.value.draft?.document ?? EMPTY_NUTRITION_DOCUMENT;
          setNutrition(plan.value); setDocument(structuredClone(next)); setBaseline(JSON.stringify(next));
          command.current = null; setUncertain(false);
        } else setError(plan.reason instanceof Error ? plan.reason.message : "Le plan n’a pas pu être chargé.");
        if (history.status === "fulfilled") setCheckIns(history.value);
        else setCheckInError("Les check-ins n’ont pas pu être chargés. Réessaie.");
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [base, attempt]);

  useEffect(() => {
    if (!dirty && !uncertain) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, uncertain]);

  useEffect(() => { if (confirmPublish) publishCancel.current?.focus(); }, [confirmPublish]);

  function closeConfirmation() { setConfirmPublish(false); publishTrigger.current?.focus(); }
  function invalidPublication() {
    if (!document.title.fr.trim() && !document.title.en.trim()) return "nutrition-title-fr";
    const incomplete = document.meals.find(meal => (!meal.title.fr.trim() && !meal.title.en.trim()) || (!meal.portions.fr.trim() && !meal.portions.en.trim()));
    if (incomplete) return `meal-${incomplete.id}-${!incomplete.title.fr.trim() && !incomplete.title.en.trim() ? "title" : "portions"}-fr`;
    return document.meals.length === 0 ? "add-meal" : null;
  }
  function beginPublish() {
    const invalid = invalidPublication();
    if (invalid) {
      setError("Complète le titre du plan, puis au moins un repas avec son nom et ses portions. Une langue suffit; la seconde est facultative.");
      window.document.getElementById(invalid)?.focus();
      return;
    }
    setConfirmPublish(true);
  }
  async function mutate(action: "save" | "publish" | "withdraw", retry = false) {
    if (!nutrition || inFlight.current) return;
    if (action === "withdraw" && !retry && !nutrition.publication) return;
    inFlight.current = true; setBusy(true); setError(null); setSuccess(null); setConfirmPublish(false);
    setConfirmWithdraw(false);
    if (!retry || !command.current) command.current = action === "save"
      ? { action, document: structuredClone(document), expectedVersion: nutrition.draft?.version ?? 0, clientMutationId: crypto.randomUUID() }
      : action === "withdraw" ? { action, expectedPublicationId: nutrition.publication!.id, clientMutationId: crypto.randomUUID() }
      : { action, expectedVersion: nutrition.draft?.version ?? 0, expectedPublicationId: nutrition.publication?.id ?? null, clientMutationId: crypto.randomUUID() };
    const valid = nutritionMutationSchema.safeParse(command.current);
    if (!valid.success) {
      setError("Vérifie les cibles et la longueur des textes. Les champs non remplis peuvent rester vides dans un brouillon.");
      command.current = null; inFlight.current = false; setBusy(false); return;
    }
    try {
      const result = await request(`${base}/nutrition`, coachNutritionResponseSchema, command.current);
      const next = result.draft?.document ?? EMPTY_NUTRITION_DOCUMENT;
      setNutrition(result);
      if (command.current.action !== "withdraw") { setDocument(structuredClone(next)); setBaseline(JSON.stringify(next)); }
      setSuccess(command.current.action === "withdraw" ? result.publication
        ? "Le retrait est confirmé. Un nouveau plan est maintenant actif; il n’a pas été retiré."
        : "Plan nutritionnel retiré. Les versions précédentes restent consultables."
        : command.current.action === "publish" ? "Plan nutritionnel publié. Le client peut maintenant le consulter." : "Brouillon enregistré. Il reste privé jusqu’à la publication.");
      command.current = null; setUncertain(false);
    } catch (caught) {
      const editable = caught instanceof FollowupRequestError && caught.status === 400;
      setUncertain(!editable);
      if (editable) command.current = null;
      setError(`${caught instanceof Error ? caught.message : "La connexion a été interrompue."}${editable ? "" : " Réessaie la même demande pour confirmer son résultat, ou recharge l’état enregistré."}`);
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function historyPage(page: number) {
    if (loadingHistory) return;
    setLoadingHistory(true); setCheckInError(null);
    try { setCheckIns(await request(`${base}/check-ins?page=${page}`, coachCheckInsResponseSchema)); }
    catch { setCheckInError("Cette page de check-ins n’a pas pu être chargée. Réessaie."); }
    finally { setLoadingHistory(false); }
  }
  const updatePair = (key: "title" | "instructions" | "preparation" | "grocery", value: Pair) => setDocument(current => ({ ...current, [key]: value }));
  const updateMeal = (id: string, key: "title" | "timeLabel" | "portions" | "notes", value: Pair) => setDocument(current => ({ ...current, meals: current.meals.map(meal => meal.id === id ? { ...meal, [key]: value } : meal) }));

  return <AppShell space="coach" current="clients" documentNavigation>
    <div className={styles.page}>
      <Link className="fe-button" href={`/coach/clients/${encodeURIComponent(clientId)}`}>← Dossier client</Link>
      <header><p className="fe-kicker">Suivi du client</p><h1>Nutrition et check-ins</h1><p>Le plan que tu prescris. Les observations que ton client te transmet.</p></header>
      {loading ? <Loading>Chargement du suivi…</Loading> : null}
      {error ? <Feedback>{error}</Feedback> : null}
      {success ? <div className={styles.success} role="status">{success}</div> : null}
      {!loading && !nutrition ? <button className="fe-button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button> : null}
      {!loading && nutrition ? <section className={styles.panel} aria-labelledby="coach-nutrition-heading">
        <header><p className="fe-kicker">Prescription nutritionnelle</p><h2 id="coach-nutrition-heading">Construire le plan</h2>
          <p>{nutrition.publication ? `Version ${nutrition.publication.revision} publiée le ${new Date(nutrition.publication.publishedAt).toLocaleDateString("fr-CA")}. Elle reste visible pendant tes modifications.` : "Aucun plan publié pour ce client."}</p>
          {nutrition.publication ? <button ref={withdrawTrigger} className="fe-button" type="button" disabled={busy || uncertain} onClick={() => setConfirmWithdraw(true)}>Retirer le plan actif</button> : null}
        </header>
        <p>Les champs * sont nécessaires à la publication. Une version française ou anglaise suffit. Les textes libres ne sont pas traduits automatiquement.</p>
        <fieldset className={styles.editor} disabled={busy || uncertain}>
          <PairFields id="nutrition-title" label="Titre du plan" value={document.title} onChange={value => updatePair("title", value)} required />
          <fieldset className={styles.targets}><legend>Cibles prescrites — facultatives</legend>
            {([['calories', 'Calories (kcal)', 15000], ['proteinG', 'Protéines (g)', 1000], ['carbohydrateG', 'Glucides (g)', 2000], ['fatG', 'Lipides (g)', 1000]] as const).map(([key, label, max]) => <label key={key}>{label}<input type="number" min={0} max={max} step="any" value={document.targets[key] ?? ""} onChange={event => setDocument(current => ({ ...current, targets: { ...current.targets, [key]: event.target.value === "" ? null : Number(event.target.value) } }))} /></label>)}
          </fieldset>
          <h3>Repas</h3>
          {document.meals.map((meal, index) => <section className={styles.meal} key={meal.id} aria-label={`Repas ${index + 1}`}>
            <header><h3>Repas {index + 1}</h3><button className="fe-button" type="button" onClick={() => setDocument(current => ({ ...current, meals: current.meals.filter(item => item.id !== meal.id) }))}>Retirer le repas {index + 1}</button></header>
            <PairFields id={`meal-${meal.id}-title`} label="Nom du repas" required value={meal.title} onChange={value => updateMeal(meal.id, "title", value)} />
            <PairFields id={`meal-${meal.id}-time`} label="Moment / horaire — facultatif" value={meal.timeLabel ?? blankPair()} onChange={value => updateMeal(meal.id, "timeLabel", value)} />
            <PairFields id={`meal-${meal.id}-portions`} label="Aliments et portions (précise cru/cuit si pertinent)" required value={meal.portions} onChange={value => updateMeal(meal.id, "portions", value)} />
            <PairFields id={`meal-${meal.id}-notes`} label="Notes du repas — facultatives" value={meal.notes} onChange={value => updateMeal(meal.id, "notes", value)} />
          </section>)}
          <button id="add-meal" className="fe-button" type="button" disabled={document.meals.length >= 20} onClick={() => setDocument(current => ({ ...current, meals: [...current.meals, { id: crypto.randomUUID(), title: blankPair(), timeLabel: blankPair(), portions: blankPair(), notes: blankPair() }] }))}>+ Ajouter un repas</button>
          <PairFields id="nutrition-instructions" label="Consignes" value={document.instructions} onChange={value => updatePair("instructions", value)} />
          <PairFields id="nutrition-preparation" label="Préparation — facultative" value={document.preparation} onChange={value => updatePair("preparation", value)} />
          <PairFields id="nutrition-grocery" label="Liste d’épicerie prescrite — facultative" value={document.grocery} onChange={value => updatePair("grocery", value)} />
        </fieldset>
        <div className={styles.actions}>
          <button className="fe-button fe-button-primary" disabled={busy || uncertain || !dirty} onClick={() => mutate("save")}>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}</button>
          <button ref={publishTrigger} className="fe-button" disabled={busy || uncertain || dirty || !nutrition.draft || draftAlreadyPublished} onClick={beginPublish}>Publier le plan nutritionnel</button>
          {!nutrition.publication && draftAlreadyPublished ? <small>Modifie puis enregistre le brouillon pour publier une nouvelle version.</small> : null}
          {dirty ? <small>Enregistre tes modifications avant de publier.</small> : null}
          {uncertain ? <><button className="fe-button" disabled={busy} onClick={() => mutate(command.current?.action ?? "save", true)}>Réessayer la même demande</button><button className="fe-button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Recharger l’état enregistré</button></> : null}
        </div>
        {nutrition.history.length ? <details><summary>Publications conservées ({nutrition.history.length}{nutrition.historyTruncated ? "+" : ""})</summary>{nutrition.history.map(item => <p key={item.id}>Version {item.revision} · {item.document.title.fr || item.document.title.en} · {new Date(item.publishedAt).toLocaleString("fr-CA")}{item.withdrawnAt ? ` · Plan retiré le ${new Date(item.withdrawnAt).toLocaleString("fr-CA")}` : ""}</p>)}</details> : null}
      </section> : null}
      <section className={styles.panel} aria-labelledby="coach-checkins-heading"><h2 id="coach-checkins-heading">Check-ins transmis</h2><p>Les brouillons du client restent privés. Les réponses transmises sont conservées telles quelles.</p>
        <button className="fe-button" disabled={loadingHistory} onClick={() => historyPage(checkIns?.page ?? 0)}>{loadingHistory ? "Actualisation…" : "Actualiser les check-ins"}</button>
        {checkInError ? <><Feedback>{checkInError}</Feedback><button className="fe-button" disabled={loadingHistory} onClick={() => historyPage(checkIns?.page ?? 0)}>Réessayer les check-ins</button></> : null}
        {checkIns && checkIns.history.length === 0 ? <p>Aucun check-in transmis pour le moment.</p> : null}
        {checkIns?.history.map(item => <details className={styles.submission} key={item.id}><summary>Observations du {new Date(`${item.document.observedOn}T12:00:00Z`).toLocaleDateString("fr-CA", { timeZone: "UTC" })}</summary>
          <p>Transmis le {new Date(item.submittedAt).toLocaleString("fr-CA")}</p>
          <dl className={styles.observations}>{(Object.entries(item.document.measurements) as [keyof CheckInMeasurements, number | null][]).filter(([,value]) => value !== null).map(([key,value]) => <div key={key}><dt>{observationLabels[key]}</dt><dd>{value}</dd></div>)}
            {([['sleepHours','Sommeil (heures)'],['sleepQuality','Qualité du sommeil /10'],['energy','Énergie /10'],['stress','Stress /10'],['soreness','Courbatures /10'],['cardioMinutes','Cardio (minutes)'],['cardioZone','Zone cardio']] as const).filter(([key]) => item.document[key] !== null).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{item.document[key]}</dd></div>)}
          </dl>
          {item.document.notes ? <p className={styles.preserve}>{item.document.notes}</p> : null}
        </details>)}
        {checkIns && checkIns.total > 50 ? <nav className={styles.actions} aria-label="Pages de check-ins"><button className="fe-button" disabled={loadingHistory || checkIns.page === 0} onClick={() => historyPage(checkIns.page - 1)}>Précédents</button><span>Page {checkIns.page + 1} · {checkIns.total} check-ins</span><button className="fe-button" disabled={loadingHistory || (checkIns.page + 1) * 50 >= checkIns.total} onClick={() => historyPage(checkIns.page + 1)}>Suivants</button></nav> : null}
      </section>
      {confirmWithdraw ? <PlanWithdrawalDialog title="Retirer ce plan nutritionnel?" onCancel={() => { setConfirmWithdraw(false); withdrawTrigger.current?.focus(); }} onConfirm={() => void mutate("withdraw")} /> : null}
      {confirmPublish ? <div className={styles.backdrop} onKeyDown={event => {
        if (event.key === "Escape") closeConfirmation();
        if (event.key === "Tab") {
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
          if (event.shiftKey && window.document.activeElement === buttons[0]) { event.preventDefault(); buttons[1]?.focus(); }
          else if (!event.shiftKey && window.document.activeElement === buttons[1]) { event.preventDefault(); buttons[0]?.focus(); }
        }
      }}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="nutrition-confirm-title"><h2 id="nutrition-confirm-title">Publier ce plan?</h2><p>Le client verra cette nouvelle version dès sa prochaine lecture. La publication précédente reste conservée.</p><div className={styles.actions}><button ref={publishCancel} className="fe-button" onClick={closeConfirmation}>Annuler</button><button className="fe-button fe-button-primary" onClick={() => mutate("publish")}>Confirmer la publication</button></div></section></div> : null}
    </div>
  </AppShell>;
}
