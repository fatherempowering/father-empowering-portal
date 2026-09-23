"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import type { ClientDashboard } from "@/features/client/dashboard/contracts";
import { ONBOARDING_QUESTIONS, ONBOARDING_SECTIONS, type OnboardingCopy, type OnboardingQuestion, type OnboardingQuestionKey } from "@/lib/contracts/onboarding-definition";
import { onboardingSnapshotSchema, completeOnboardingResponsesSchema, isOnboardingComplete, type OnboardingResponses, type OnboardingSnapshot } from "@/lib/contracts/onboarding";
import styles from "./onboarding.module.css";

type Command = { fingerprint: string; key: string };
const REVIEW_STEP = ONBOARDING_SECTIONS.length;
const hasAnswer = (value: OnboardingResponses[OnboardingQuestionKey]) =>
  Array.isArray(value) ? value.length > 0 : value !== null && (typeof value !== "string" || value.trim().length > 0);

async function requestIntake(body?: unknown, submit = false): Promise<OnboardingSnapshot> {
  const response = await fetch(`/api/v1/client/onboarding${submit ? "/submit" : ""}`, {
    method: body ? submit ? "POST" : "PUT" : "GET",
    cache: "no-store", signal: AbortSignal.timeout(15_000),
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(String(response.status));
  return onboardingSnapshotSchema.parse((await response.json()).data?.intake);
}

export function ClientOnboarding() {
  const [client, setClient] = useState<ClientDashboard | null>(null);
  const [intake, setIntake] = useState<OnboardingSnapshot | null>(null);
  const [responses, setResponses] = useState<OnboardingResponses | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const leavingIntentionally = useRef(false);
  const saveCommand = useRef<Command | null>(null);
  const submitCommand = useRef<Command | null>(null);
  const french = client?.locale !== "en-CA";
  const t = (fr: string, en: string) => french ? fr : en;
  const copy = (text: OnboardingCopy) => french ? text.fr : text.en;
  const submitted = intake?.status === "SUBMITTED";
  const dirty = responses !== null && intake !== null && JSON.stringify(responses) !== JSON.stringify(intake.responses);
  const required = ONBOARDING_QUESTIONS.filter((q) => q.required);
  const validation = responses ? completeOnboardingResponsesSchema.safeParse(responses) : null;
  const invalidKeys = new Set(validation && !validation.success ? validation.error.issues.map((issue) => String(issue.path[0])) : []);
  const needsAttention = ONBOARDING_QUESTIONS.filter((q) => invalidKeys.has(q.key));
  const validRequiredCount = required.filter((q) => responses && hasAnswer(responses[q.key]) && !invalidKeys.has(q.key)).length;
  const currentSection = ONBOARDING_SECTIONS[step];

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setFailed(false); setLoading(true); setError(null); setConflict(false); setSessionExpired(false);
    Promise.all([
      fetch("/api/v1/client/me", { cache: "no-store", signal: controller.signal }).then(async (r) => {
        if (r.status === 401 || r.status === 403) { window.location.replace("/client-login"); throw new Error("401"); }
        if (!r.ok) throw new Error("503");
        return (await r.json()).client as ClientDashboard;
      }),
      requestIntake(),
    ]).then(([profile, record]) => {
      if (!active) return;
      setClient(profile); setIntake(record); setResponses(record.responses);
      setConflict(false); setSessionExpired(false); setError(null); setSavedNotice(false);
      saveCommand.current = null; submitCommand.current = null;
    }).catch((caught) => {
      if (!active) return;
      if (caught instanceof Error && ["401", "403"].includes(caught.message)) {
        window.location.replace("/client-login");
      } else setFailed(true);
    }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!leavingIntentionally.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const followLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a[href]");
      if (anchor && anchor.getAttribute("target") !== "_blank" &&
        !window.confirm(french ? "Tes dernières réponses ne sont pas enregistrées. Quitter cette page ?" : "Your latest answers have not been saved. Leave this page?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", followLink, true); };
  }, [dirty, french]);

  function goToStep(next: number) {
    setStep(next);
    setTimeout(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }, 0);
  }
  function edit(key: OnboardingQuestionKey, value: OnboardingResponses[OnboardingQuestionKey]) {
    setResponses((current) => current && ({ ...current, [key]: value }));
    setSavedNotice(false); setError(null);
  }
  function commandKey(ref: { current: Command | null }, payload: unknown) {
    const fingerprint = JSON.stringify(payload);
    if (ref.current?.fingerprint !== fingerprint) ref.current = { fingerprint, key: crypto.randomUUID() };
    return ref.current.key;
  }
  async function persist(send: boolean, nextStep?: number) {
    if (!intake || !responses || inFlight.current || conflict || submitted || sessionExpired) return;
    if (form.current && !form.current.reportValidity()) return;
    if (send && !isOnboardingComplete(responses)) {
      setError(t("Complète les réponses obligatoires avant de transmettre.", "Complete the required answers before submitting.")); return;
    }
    inFlight.current = true; setBusy(true); setError(null); setSavedNotice(false);
    try {
      let current = intake;
      if (dirty || current.status === "NOT_STARTED") {
        const payload = { expectedVersion: current.version, responses };
        current = await requestIntake({ ...payload, clientMutationId: commandKey(saveCommand, payload) });
        setIntake(current); setResponses(current.responses); saveCommand.current = null;
      }
      if (send) {
        const payload = { expectedVersion: current.version };
        current = await requestIntake({ ...payload, clientMutationId: commandKey(submitCommand, payload) }, true);
        setIntake(current); setResponses(current.responses); submitCommand.current = null;
      }
      setSavedNotice(true);
      if (nextStep !== undefined) goToStep(nextStep);
      else if (send) window.scrollTo({ top: 0 });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "503";
      if (code === "409") setConflict(true);
      if (code === "401" || code === "403") setSessionExpired(true);
      setError(code === "409"
        ? t("Une version plus récente existe ou le questionnaire a déjà été transmis. Tes saisies restent affichées. Recharge la version enregistrée avant de continuer.", "A newer version exists or the questionnaire has already been submitted. Your entries remain here. Reload the saved version before continuing.")
        : code === "401" || code === "403"
          ? t("Ta session n’est plus valide. Reconnecte-toi pour continuer; tes réponses déjà enregistrées restent conservées.", "Your session is no longer valid. Sign in again to continue; your previously saved answers are retained.")
          : code === "400" || code === "413"
            ? t("Vérifie le format et la longueur de tes réponses. Rien n’a été transmis au Coach. Tes saisies restent à l’écran.", "Check the format and length of your answers. Nothing was submitted to your Coach. Your entries remain on this page.")
            : t("La confirmation n’a pas été reçue. Tes réponses restent à l’écran. Réessaie la même action pour confirmer l’enregistrement sans doublon.", "Confirmation was not received. Your answers remain here. Retry the same action to confirm the save without duplication."));
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function signOut() {
    if (inFlight.current) return;
    if (dirty && !window.confirm(t("Tes dernières réponses ne sont pas enregistrées. Te déconnecter ?", "Your latest answers have not been saved. Sign out?"))) return;
    inFlight.current = true; setBusy(true);
    const ok = await requestClientLogout(() => { leavingIntentionally.current = true; window.location.replace("/client-login"); });
    if (!ok) { setError(t("Déconnexion impossible. Réessaie.", "Unable to sign out. Try again.")); inFlight.current = false; setBusy(false); }
  }

  return <AppShell space="client" current="onboarding" name={client?.displayName} locale={french ? "fr" : "en"}
    accountAction={<button className="fe-button" disabled={busy} onClick={() => void signOut()}>{t("Se déconnecter", "Sign out")}</button>}>
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className="fe-kicker">The Legacy Protocol</p>
        <h1 className="fe-title">{t("Ton questionnaire d’accueil", "Your welcome questionnaire")}</h1>
        <p>{t("Ta vie, tes objectifs, tes habitudes : ces réponses aident Max à mieux te connaître. Ce questionnaire est distinct de ton bilan initial de mesures et de mobilité.", "Your life, goals and habits: these answers help Max get to know you. This questionnaire is separate from your initial measurements and mobility assessment.")}</p>
      </header>
      {error && <Feedback>{error}</Feedback>}
      {sessionExpired && <Link className="fe-button" href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>}
      {conflict && <button className="fe-button" onClick={() => {
        if (window.confirm(t("Recharger remplacera les saisies affichées par la version enregistrée. Continuer ?", "Reloading replaces the entries on screen with the saved version. Continue?"))) setAttempt((n) => n+1);
      }}>{t("Recharger la version enregistrée", "Reload the saved version")}</button>}
      {loading ? <Loading>{t("Chargement du questionnaire…", "Loading questionnaire…")}</Loading> : failed ? <><Feedback>{t("Le questionnaire ne peut pas être chargé. Aucune réponse n’a été remplacée.", "The questionnaire could not be loaded. No answers have been replaced.")}</Feedback><button className="fe-button" onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button></> : !intake || !responses ? <Loading>{t("Chargement du questionnaire…", "Loading questionnaire…")}</Loading> : <>
        <p className={styles.status} role="status" aria-live="polite">{busy ? t("Enregistrement en cours…", "Saving…") : submitted ? t("Questionnaire transmis au Coach", "Questionnaire submitted to your Coach") : dirty ? t("Modifications non enregistrées", "Unsaved changes") : intake.status === "DRAFT" ? t("Brouillon privé enregistré", "Private draft saved") : t("Questionnaire non commencé", "Questionnaire not started")}{savedNotice && !submitted ? t(". Sauvegarde confirmée.", ". Save confirmed.") : ""}</p>
        {submitted ? <>
          <Feedback tone="success">{t("Max peut maintenant lire tes réponses dans ton dossier. Tu n’as pas à les renvoyer. Ton questionnaire transmis est conservé en lecture seule.", "Max can now read your answers in your file. You do not need to resend them. Your submitted questionnaire is kept read-only.")}</Feedback>
          <div className={styles.actions}><Link className="fe-button fe-button-primary" href="/client/week-zero">{t("Accéder à mon bilan initial", "Open my initial assessment")}</Link><Link className="fe-button" href="/client">{t("Retour à mon portail", "Back to my portal")}</Link></div>
          <OnboardingReview responses={responses} french={french} />
        </> : <>
          <p className={styles.notice}>{t("Six sections, à ton rythme. « Continuer » et « Enregistrer mon brouillon » sauvegardent tes réponses dans ton espace privé. Max les verra seulement lorsque tu confirmeras « Transmettre mon questionnaire » à la fin.", "Six sections, at your own pace. “Continue” and “Save my draft” save your answers in your private portal. Max only sees them after you confirm “Submit my questionnaire” at the end.")}</p>
          <p>{t(`${validRequiredCount} réponses obligatoires sur ${required.length} complétées et valides. Les champs marqués * sont requis avant transmission.`, `${validRequiredCount} of ${required.length} required answers completed and valid. Fields marked * are required before submission.`)}</p>
          <nav aria-label={t("Sections du questionnaire", "Questionnaire sections")}><ol className={styles.steps}>
            {ONBOARDING_SECTIONS.map((section, index) => <li key={section.id}><button className={`fe-button ${step === index ? "fe-button-primary" : ""}`} type="button" disabled={busy} aria-current={step === index ? "step" : undefined} onClick={() => goToStep(index)}>{index+1}. {copy(section.title)}</button></li>)}
            <li><button className={`fe-button ${step === REVIEW_STEP ? "fe-button-primary" : ""}`} disabled={busy} type="button" aria-current={step === REVIEW_STEP ? "step" : undefined} onClick={() => goToStep(REVIEW_STEP)}>{t("Vérifier et transmettre", "Review and submit")}</button></li>
          </ol></nav>
          <form ref={form} onSubmit={(event) => { event.preventDefault(); void persist(false); }}>
            <fieldset className={styles.panel} disabled={busy || conflict || sessionExpired}>
              <legend className="fe-sr-only">{currentSection ? copy(currentSection.title) : t("Vérifier et transmettre", "Review and submit")}</legend>
              <h2 className="fe-title" ref={heading} tabIndex={-1}>{currentSection ? copy(currentSection.title) : t("Vérifier et transmettre", "Review and submit")}</h2>
              {currentSection ? <>
                <p>{copy(currentSection.description)}</p>
                <div className={styles.questions}>{currentSection.questions.map((question) => <QuestionField key={question.key} question={question} value={responses[question.key]} french={french} onChange={(value) => edit(question.key, value)} />)}</div>
              </> : <>
                <OnboardingReview responses={responses} french={french} />
                {needsAttention.length ? <div className={styles.notice} role="alert"><p>{t("Ces réponses sont manquantes ou leur format doit être corrigé. Clique sur une question pour la retrouver :", "These answers are missing or need a format correction. Select a question to find it:")}</p><ul>{needsAttention.map((question) => <li key={question.key}><button type="button" className={styles.questionLink} onClick={() => goToStep(ONBOARDING_SECTIONS.findIndex((section) => section.questions.some((q) => q.key === question.key)))}>{copy(question.label)}</button></li>)}</ul></div> : <Feedback tone="info">{t("Les réponses obligatoires sont complètes. Relis ton questionnaire avant de le transmettre à Max.", "The required answers are complete. Review your questionnaire before submitting it to Max.")}</Feedback>}
                <p>{t("Après transmission, cette version restera en lecture seule. Elle ne remplace pas ton bilan initial.", "After submission, this version remains read-only. It does not replace your initial assessment.")}</p>
                <button className="fe-button fe-button-primary fe-button-wide" type="button" disabled={busy || conflict || sessionExpired || !isOnboardingComplete(responses)} onClick={() => void persist(true)}>{t("Transmettre mon questionnaire", "Submit my questionnaire")}</button>
              </>}
            </fieldset>
            <div className={styles.actions}>
              <button className="fe-button" type="submit" disabled={busy || conflict || sessionExpired}>{t("Enregistrer mon brouillon", "Save my draft")}</button>
              {step > 0 && <button className="fe-button" type="button" disabled={busy} onClick={() => goToStep(step-1)}>{t("Précédent", "Previous")}</button>}
              {step < REVIEW_STEP && <button className="fe-button fe-button-primary" type="button" disabled={busy || conflict || sessionExpired} onClick={() => void persist(false, step+1)}>{t("Continuer", "Continue")}</button>}
            </div>
          </form>
          <p><Link href="/client/week-zero">{t("Accéder à mon bilan initial de mesures et de mobilité", "Open my measurements and mobility assessment")}</Link></p>
        </>}
      </>}
    </div>
  </AppShell>;
}

function QuestionField({ question: q, value, french, onChange }: {
  question: OnboardingQuestion; value: OnboardingResponses[OnboardingQuestionKey]; french: boolean;
  onChange(value: OnboardingResponses[OnboardingQuestionKey]): void;
}) {
  const copy = (text: OnboardingCopy) => french ? text.fr : text.en;
  const label = `${copy(q.label)}${q.required ? " *" : ""}`;
  const id = `onboarding-${q.key}`;
  const hintId = `${id}-hint`;
  const hint = <small id={hintId}>{q.helper ? `${copy(q.helper)} ` : ""}{q.maxLength ? french ? `${q.maxLength} caractères maximum.` : `${q.maxLength} characters maximum.` : q.min !== undefined ? french ? `De ${q.min} à ${q.max}.` : `From ${q.min} to ${q.max}.` : ""}</small>;
  if (q.type === "multi") return <fieldset className={styles.choices} data-question={q.key}><legend>{label}</legend>{hint}<div>{q.options?.map((option) => <label key={option.value}><input type="checkbox" checked={Array.isArray(value) && value.includes(option.value)} onChange={(event) => { const selected = Array.isArray(value) ? value : []; onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value)); }}/>{copy(option.label)}</label>)}</div></fieldset>;
  return <div className={styles.field} data-question={q.key}>
    <label htmlFor={id}>{label}</label>
    {q.type === "textarea" ? <textarea id={id} maxLength={q.maxLength} aria-describedby={hintId} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}/>
      : q.type === "single" || q.type === "scale" ? <select id={id} aria-describedby={hintId} value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : q.type === "scale" ? Number(event.target.value) : event.target.value)}>
        <option value="">{french ? "Choisir une réponse" : "Choose an answer"}</option>
        {q.type === "scale" ? Array.from({ length: (q.max ?? 10) - (q.min ?? 0) + 1 }, (_, index) => index + (q.min ?? 0)).map((score) => <option value={score} key={score}>{score}</option>) : q.options?.map((option) => <option value={option.value} key={option.value}>{copy(option.label)}</option>)}
      </select>
        : <input id={id} type={q.type} inputMode={q.type === "number" ? "decimal" : q.type === "tel" ? "tel" : undefined} autoComplete={q.key === "fullName" ? "name" : q.type === "email" ? "email" : q.type === "tel" ? "tel" : "off"} maxLength={q.maxLength} min={q.min} max={q.max} step={q.step ?? "any"} aria-describedby={hintId} value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value.trim() === "" ? null : q.type === "number" ? Number(event.target.value) : event.target.value)}/>
    }
    {hint}
  </div>;
}

function OnboardingReview({ responses, french }: { responses: OnboardingResponses; french: boolean }) {
  const copy = (text: OnboardingCopy) => french ? text.fr : text.en;
  return <div className={styles.review}>{ONBOARDING_SECTIONS.map((section) => <details key={section.id} open>
    <summary>{copy(section.title)}</summary>
    <dl>{section.questions.map((question) => {
      const value = responses[question.key];
      const optionLabel = (answer: string) => { const option = question.options?.find((o) => o.value === answer); return option ? copy(option.label) : answer; };
      const display = !hasAnswer(value) ? french ? "Non renseigné" : "Not provided" : Array.isArray(value) ? value.map(optionLabel).join(", ") : typeof value === "string" ? optionLabel(value) : String(value);
      return <div key={question.key}><dt>{copy(question.label)}</dt><dd>{display}</dd></div>;
    })}</dl>
  </details>)}</div>;
}
