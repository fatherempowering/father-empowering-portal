"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import type { ClientDashboard } from "@/features/client/dashboard/contracts";
import { initialAssessmentSnapshotSchema, type InitialAssessmentSnapshot, type InitialAssessmentResponses } from "@/lib/contracts/week-zero";
import styles from "./week-zero.module.css";

type Assessment = InitialAssessmentSnapshot;
type Command = { key: string; fingerprint: string };
const measurementFields = [
  ["bodyWeightLb", "Poids au réveil (lb)", "Morning bodyweight (lb)", true, 1500],
  ["waistIn", "Tour de taille au nombril (po)", "Waist at navel (in)", true, 200],
  ["chestIn", "Poitrine (po)", "Chest (in)", false, 200],
  ["hipsIn", "Hanches (po)", "Hips (in)", false, 200],
  ["rightArmIn", "Bras droit fléchi (po)", "Right flexed arm (in)", false, 200],
  ["rightThighIn", "Cuisse droite (po)", "Right thigh (in)", false, 200],
] as const;
const painFields = [
  ["painSquat", "Douleur pendant le squat / les jambes", "Pain during squat / legs"],
  ["painHinge", "Douleur pendant la flexion des hanches", "Pain during hip hinge"],
  ["painPush", "Douleur pendant une poussée", "Pain during push"],
  ["painPull", "Douleur pendant un tirage", "Pain during pull"],
  ["painCardio", "Douleur pendant le cardio", "Pain during cardio"],
] as const;
const mobilityFields = [
  ["limitedMovement", "Mouvement le plus limité", "Most limited movement"],
  ["comfortableMovement", "Mouvement le plus confortable", "Most comfortable movement"],
  ["tightArea", "Zone raide ou tendue", "Tight or stiff area"],
] as const;
const days = [
  ["MONDAY", "Lundi", "Monday"], ["TUESDAY", "Mardi", "Tuesday"],
  ["WEDNESDAY", "Mercredi", "Wednesday"], ["THURSDAY", "Jeudi", "Thursday"],
  ["FRIDAY", "Vendredi", "Friday"], ["SATURDAY", "Samedi", "Saturday"],
  ["SUNDAY", "Dimanche", "Sunday"],
] as const;

async function requestAssessment(path: string, body?: unknown, method = "GET"): Promise<Assessment> {
  const response = await fetch(path, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(String(response.status));
  const payload = await response.json();
  return initialAssessmentSnapshotSchema.parse(payload.data?.assessment);
}

export function ClientWeekZero() {
  const [client, setClient] = useState<ClientDashboard | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [responses, setResponses] = useState<InitialAssessmentResponses | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [savedNotice, setSavedNotice] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const leavingIntentionally = useRef(false);
  const saveCommand = useRef<Command | null>(null);
  const submitCommand = useRef<Command | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const french = client?.locale !== "en-CA";
  const t = (fr: string, en: string) => french ? fr : en;
  const submitted = assessment?.status === "SUBMITTED";
  const dirty = responses !== null && assessment !== null &&
    JSON.stringify(responses) !== JSON.stringify(assessment.responses);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setFailed(false);
    Promise.all([
      fetch("/api/v1/client/me", { cache: "no-store", signal: controller.signal }).then(async (r) => {
        if (r.status === 401 || r.status === 403) { window.location.replace("/client-login"); throw new Error("401"); }
        if (!r.ok) throw new Error("503");
        return (await r.json()).client as ClientDashboard;
      }),
      requestAssessment("/api/v1/client/week-zero"),
    ]).then(([profile, record]) => {
      if (!active) return;
      setClient(profile); setAssessment(record); setResponses(record.responses);
      setConflict(false); setError(null); setSavedNotice(false); setSessionExpired(false);
    }).catch(() => { if (active) setFailed(true); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!leavingIntentionally.current) { e.preventDefault(); e.returnValue = ""; }
    };
    const followLink = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]");
      if (anchor && anchor.getAttribute("target") !== "_blank" &&
          !window.confirm(french ? "Tes modifications ne sont pas enregistrées. Quitter cette page ?" : "Your changes have not been saved. Leave this page?")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", followLink, true); };
  }, [dirty, french]);

  function edit<S extends keyof InitialAssessmentResponses, K extends keyof InitialAssessmentResponses[S]>(
    section: S, field: K, value: InitialAssessmentResponses[S][K],
  ) {
    setResponses((current) => current && ({ ...current, [section]: { ...current[section], [field]: value } }));
    setSavedNotice(false); setError(null);
  }
  function goToStep(next: number) { setStep(next); setTimeout(() => heading.current?.focus(), 0); }
  function commandKey(ref: { current: Command | null }, payload: unknown) {
    const fingerprint = JSON.stringify(payload);
    if (ref.current?.fingerprint !== fingerprint) ref.current = { fingerprint, key: crypto.randomUUID() };
    return ref.current!.key;
  }
  async function persist(send: boolean) {
    if (!assessment || !responses || busy || conflict || submitted) return;
    setBusy(true); setError(null); setSavedNotice(false);
    try {
      let current = assessment;
      if (dirty || current.status === "NOT_STARTED") {
        const draft = { expectedVersion: current.version, responses };
        current = await requestAssessment("/api/v1/client/week-zero", {
          ...draft, clientMutationId: commandKey(saveCommand, draft),
        }, "PUT");
        setAssessment(current); setResponses(current.responses); saveCommand.current = null;
      }
      if (send) {
        const submission = { expectedVersion: current.version };
        current = await requestAssessment("/api/v1/client/week-zero/submit", {
          ...submission, clientMutationId: commandKey(submitCommand, submission),
        }, "POST");
        setAssessment(current); setResponses(current.responses); submitCommand.current = null;
      }
      setSavedNotice(true);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "503";
      if (code === "409") setConflict(true);
      if (code === "401" || code === "403") setSessionExpired(true);
      setError(code === "409"
        ? t("Une version plus récente existe ou ce bilan a déjà été transmis. Tes saisies restent affichées. Recharge la version enregistrée avant de continuer.", "A newer version exists or this assessment has already been submitted. Your entries remain here. Reload the saved version before continuing.")
        : code === "400"
          ? t("Vérifie les valeurs et les champs obligatoires avant de transmettre. Tes saisies sont conservées à l’écran.", "Check the values and required fields before submitting. Your entries remain on this page.")
          : code === "401" || code === "403"
            ? t("Ta session n’est plus valide. Reconnecte-toi pour continuer. Seules les données déjà enregistrées sont conservées sur le serveur.", "Your session is no longer valid. Sign in again to continue. Only previously saved data is retained on the server.")
            : t("La confirmation n’a pas été reçue. Tes saisies restent à l’écran. Réessaie la même action pour vérifier son enregistrement sans doublon.", "Confirmation was not received. Your entries remain here. Retry the same action to confirm it without creating a duplicate."));
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (dirty && !window.confirm(t("Tes modifications ne sont pas enregistrées. Te déconnecter ?", "Your changes have not been saved. Sign out?"))) return;
    setBusy(true);
    const received = await requestClientLogout(() => {
      leavingIntentionally.current = true;
      window.location.replace("/client-login");
    });
    if (!received) { setError(t("Déconnexion impossible. Réessaie.", "Unable to sign out. Try again.")); setBusy(false); }
  }
  const missing = responses ? [
    ...measurementFields.filter(([key,,, required]) => required && !responses.measurements[key]).map(([,fr,en]) => t(fr,en)),
    ...painFields.filter(([key]) => responses.mobility[key] === "NOT_ASSESSED").map(([,fr,en]) => t(fr,en)),
    ...mobilityFields.filter(([key]) => !responses.mobility[key]?.trim()).map(([,fr,en]) => t(fr,en)),
  ] : [];
  const titles = [t("Mesures", "Measurements"), t("Mobilité", "Mobility"), t("Disponibilités", "Availability"), t("Vérifier et transmettre", "Review and submit")];

  return <AppShell space="client" current="week-zero" name={client?.displayName} locale={french ? "fr" : "en"}
    accountAction={<button className="fe-button" disabled={busy} onClick={() => void signOut()}>{t("Se déconnecter", "Sign out")}</button>}>
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className="fe-kicker">Week Zero</p>
        <h1 className="fe-title">{t("Ton bilan initial", "Your initial assessment")}</h1>
        <p>{t("Partage ton point de départ avec ton Coach : mesures, mobilité et disponibilités. Tu peux enregistrer, revenir plus tard, puis transmettre ton bilan.", "Share your starting point with your Coach: measurements, mobility and availability. Save your progress, return later, then submit your assessment.")}</p>
      </header>
      {error && <Feedback>{error}</Feedback>}
      {sessionExpired && <Link className="fe-button" href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>}
      {conflict && <button className="fe-button" onClick={() => {
        if (window.confirm(t("Recharger remplacera les saisies affichées par la dernière version enregistrée. Continuer ?", "Reloading replaces the entries shown with the latest saved version. Continue?"))) setAttempt((n) => n+1);
      }}>{t("Recharger la version enregistrée", "Reload saved version")}</button>}
      {failed ? <><Feedback>{t("Impossible de charger ton bilan. Aucune donnée n’a été remplacée.", "Unable to load your assessment. No data was replaced.")}</Feedback><button className="fe-button" onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button></> : !assessment || !responses ? <Loading>{t("Chargement du bilan…", "Loading assessment…")}</Loading> : <>
        <p className={styles.status} role="status" aria-live="polite">
          {busy ? t("Enregistrement en cours…", "Saving…") : submitted ? t("Bilan initial transmis au Coach", "Initial assessment submitted to your Coach") : dirty ? t("Modifications non enregistrées", "Unsaved changes") : assessment.status === "DRAFT" ? t("Brouillon enregistré — pas encore transmis au Coach", "Draft saved — not yet submitted to your Coach") : t("Bilan initial non commencé", "Initial assessment not started")}
          {savedNotice && !submitted ? t(". Sauvegarde confirmée.", ". Save confirmed.") : ""}
        </p>
        {submitted ? <>
          <Feedback tone="success">{t("Ton Coach peut maintenant consulter ce bilan dans ton dossier. Tu n’as pas à le renvoyer. Les réponses transmises sont conservées en lecture seule.", "Your Coach can now read this assessment in your file. You do not need to resend it. Submitted answers are kept read-only.")}</Feedback>
          <p className={styles.notice}>{t("Ce bilan est la première étape du Week Zero. Photos, calibration des charges et cardio ne sont pas encore disponibles dans cette application. Ton programme n’est pas encore publié ici.", "This assessment is the first Week Zero step. Photos, load calibration and cardio are not yet available in this application. Your program is not published here yet.")}</p>
          <AssessmentReview responses={responses} french={french} />
          <Link className="fe-button" href="/client">{t("Retour à mon portail", "Back to my portal")}</Link>
        </> : <>
          <p className={styles.notice}>{t("Enregistrer conserve tes réponses dans ton espace privé. Seul « Transmettre mon bilan au Coach » rend ce bilan visible dans ton dossier Coach.", "Saving keeps your answers in your private portal. Only “Submit my assessment to my Coach” makes it visible in your Coach’s client file.")}</p>
          <nav aria-label={t("Étapes du bilan initial", "Assessment steps")}><ol className={styles.steps}>{titles.map((title,index) => <li key={title}><button className={`fe-button ${step===index ? "fe-button-primary" : ""}`} type="button" aria-current={step===index ? "step" : undefined} disabled={busy} onClick={() => goToStep(index)}>{index+1}. {title}</button></li>)}</ol></nav>
          <form onSubmit={(event) => { event.preventDefault(); void persist(false); }}>
            <fieldset className={styles.panel} disabled={busy || conflict}>
              <legend className="fe-sr-only">{titles[step]}</legend>
              <h2 className="fe-title" ref={heading} tabIndex={-1}>{titles[step]}</h2>
              {step === 0 && <><p>{t("Le poids et le tour de taille sont obligatoires pour transmettre. Les autres mesures sont facultatives. Les unités restent celles du portail Legacy : livres et pouces.", "Weight and waist are required to submit. Other measurements are optional. Units match the Legacy portal: pounds and inches.")}</p><div className={styles.grid}>
                {measurementFields.map(([key,fr,en,required,max]) => <label className={styles.field} key={key}>{t(fr,en)}{required ? " *" : ""}<input type="number" inputMode="decimal" min="0.01" max={max} step="any" value={responses.measurements[key] ?? ""} onChange={(e) => edit("measurements",key,e.target.value==="" ? null : Number(e.target.value))} /></label>)}
                <label className={`${styles.field} ${styles.wide}`}>{t("Autres précisions (facultatif)", "Other details (optional)")}<textarea maxLength={500} value={responses.measurements.other ?? ""} onChange={(e) => edit("measurements","other",e.target.value || null)} /></label>
              </div></>}
              {step === 1 && <><p>{t("Réponds selon ce que tu as déjà observé, sans provoquer une douleur pour compléter le formulaire. Inscris « N.A. » dans un texte si rien n’est à signaler.", "Answer from what you have already observed; do not cause pain to complete this form. Enter “N.A.” in a text field when there is nothing to report.")}</p><div className={styles.grid}>
                {painFields.map(([key,fr,en]) => <label className={styles.field} key={key}>{t(fr,en)} *<select value={responses.mobility[key]} onChange={(e) => edit("mobility",key,e.target.value as InitialAssessmentResponses["mobility"][typeof key])}><option value="NOT_ASSESSED">{t("Choisir une réponse", "Choose an answer")}</option><option value="NO">{t("Non", "No")}</option><option value="YES">{t("Oui", "Yes")}</option></select></label>)}
                {mobilityFields.map(([key,fr,en]) => <label className={`${styles.field} ${styles.wide}`} key={key}>{t(fr,en)} *<textarea maxLength={500} value={responses.mobility[key] ?? ""} onChange={(e) => edit("mobility",key,e.target.value || null)} /></label>)}
              </div></>}
              {step === 2 && <><p>{t("Facultatif : indique ce qui est réaliste pour toi. Cela aide ton Coach à organiser la suite; ce n’est pas un calendrier prescrit.", "Optional: tell your Coach what is realistic for you. This helps plan the next steps; it is not a prescribed schedule.")}</p>
                <fieldset><legend>{t("Jours possibles", "Available days")}</legend><div className={styles.days}>{days.map(([day,fr,en]) => <label key={day}><input type="checkbox" checked={responses.availability.days.includes(day)} onChange={(e) => edit("availability","days",e.target.checked ? [...responses.availability.days,day] : responses.availability.days.filter((d) => d!==day))}/>{t(fr,en)}</label>)}</div></fieldset>
                <div className={styles.grid}>
                  <label className={styles.field}>{t("Moment de la journée (facultatif)", "Best time of day (optional)")}<input maxLength={120} value={responses.availability.bestTime ?? ""} onChange={(e) => edit("availability","bestTime",e.target.value || null)}/></label>
                  <label className={styles.field}>{t("Durée disponible par séance (minutes, facultatif)", "Time per session (minutes, optional)")}<input type="number" min="1" max="480" step="1" value={responses.availability.sessionDurationMinutes ?? ""} onChange={(e) => edit("availability","sessionDurationMinutes",e.target.value===""?null:Number(e.target.value))}/></label>
                  <label className={styles.field}>{t("Séances possibles par semaine (facultatif)", "Sessions per week (optional)")}<input type="number" min="1" max="7" step="1" value={responses.availability.sessionsPerWeek ?? ""} onChange={(e) => edit("availability","sessionsPerWeek",e.target.value===""?null:Number(e.target.value))}/></label>
                  <label className={`${styles.field} ${styles.wide}`}>{t("Contraintes à partager (facultatif)", "Constraints to share (optional)")}<textarea maxLength={1000} value={responses.availability.constraints ?? ""} onChange={(e) => edit("availability","constraints",e.target.value || null)} /></label>
                </div></>}
              {step === 3 && <>
                <AssessmentReview responses={responses} french={french}/>
                {missing.length > 0 ? <Feedback>{t("À compléter avant de transmettre : ", "Complete before submitting: ")}{missing.join("; ")}</Feedback> : <Feedback tone="info">{t("Les champs requis du bilan initial sont remplis. Vérifie tes réponses puis confirme leur transmission à ton Coach.", "The required assessment fields are filled. Review your answers, then confirm submission to your Coach.")}</Feedback>}
                <p className={styles.notice}>{t("Ce bilan ne remplace pas les autres étapes Week Zero : photos, charges et cardio seront intégrés ensuite. Ton Coach recevra uniquement les réponses affichées ci-dessus.", "This assessment does not replace the other Week Zero steps: photos, loads and cardio will be integrated later. Your Coach receives only the answers shown above.")}</p>
                <button className="fe-button fe-button-primary fe-button-wide" type="button" disabled={busy || conflict || missing.length>0} onClick={() => void persist(true)}>{t("Transmettre mon bilan au Coach", "Submit my assessment to my Coach")}</button>
              </>}
            </fieldset>
            <div className={styles.actions}>
              <button className="fe-button" type="submit" disabled={busy || conflict}>{t("Enregistrer mon brouillon", "Save my draft")}</button>
              {step>0 && <button className="fe-button" type="button" disabled={busy} onClick={() => goToStep(step-1)}>{t("Précédent", "Previous")}</button>}
              {step<3 && <button className="fe-button fe-button-primary" type="button" disabled={busy} onClick={() => goToStep(step+1)}>{t("Continuer", "Continue")}</button>}
            </div>
          </form>
          <p>{t("Pour partager tes objectifs, tes habitudes et ton parcours personnel : ", "To share your goals, habits and personal background: ")}<a href="/client/onboarding">{t("Ouvrir mon questionnaire d’accueil", "Open my welcome questionnaire")}</a>. {t("Il est distinct de ce bilan de mesures et de mobilité, et se remplit maintenant directement dans ton portail.", "It is separate from this measurements and mobility assessment, and is now completed directly in your portal.")}</p>
        </>}
      </>}
    </div>
  </AppShell>;
}

function AssessmentReview({ responses, french }: { responses: InitialAssessmentResponses; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  const empty = t("Non renseigné", "Not provided");
  const rows: [string, string][] = [
    ...measurementFields.map(([key,fr,en]): [string,string] => [t(fr,en),String(responses.measurements[key] ?? empty)]),
    [t("Autres précisions", "Other details"),responses.measurements.other || empty],
    ...painFields.map(([key,fr,en]): [string,string] => [t(fr,en),responses.mobility[key]==="NOT_ASSESSED" ? empty : responses.mobility[key]==="YES" ? t("Oui","Yes") : t("Non","No")]),
    ...mobilityFields.map(([key,fr,en]): [string,string] => [t(fr,en),responses.mobility[key] || empty]),
    [t("Jours possibles", "Available days"),days.filter(([key]) => responses.availability.days.includes(key)).map(([,fr,en]) => t(fr,en)).join(", ") || empty],
    [t("Moment de la journée", "Best time of day"),responses.availability.bestTime || empty],
    [t("Minutes par séance", "Minutes per session"),String(responses.availability.sessionDurationMinutes ?? empty)],
    [t("Séances par semaine", "Sessions per week"),String(responses.availability.sessionsPerWeek ?? empty)],
    [t("Contraintes", "Constraints"),responses.availability.constraints || empty],
  ];
  return <dl className={styles.review}>{rows.map(([label,value]) => <div key={label} style={{display:"contents"}}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
