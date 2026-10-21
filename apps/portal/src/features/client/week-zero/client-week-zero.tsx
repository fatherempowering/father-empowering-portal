"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/fe/icon";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import type { ClientDashboard } from "@/features/client/dashboard/contracts";
import { ClientVisualShell } from "@/features/client/dashboard/client-visual-shell";
import {
  completeWeekZeroAcquisitionResponsesSchema,
  WEEK_ZERO_MOVEMENT_KEYS,
  WEEK_ZERO_MOVEMENT_VARIANTS,
  WEEK_ZERO_VARIANT_LOAD_MODES,
  weekZeroAcquisitionResponsesSchema,
  weekZeroAcquisitionSnapshotSchema,
  weekZeroPhotoUploadResponseSchema,
  type WeekZeroAcquisitionResponses,
  type WeekZeroAcquisitionSnapshot,
  type WeekZeroLoadEntry,
  type WeekZeroMovementKey,
  type WeekZeroPhotoSlot,
} from "@/lib/contracts/week-zero-acquisition";
import {
  initialAssessmentSnapshotSchema,
  type InitialAssessmentResponses,
  type InitialAssessmentSnapshot,
} from "@/lib/contracts/week-zero";
import styles from "./week-zero.module.css";

type Command = { fingerprint: string; key: string };
type PhotoAttempt = {
  assetId: string;
  expectedVersion: number;
  file: File;
  key: string;
  slot: WeekZeroPhotoSlot;
};

const measurementFields = [
  ["bodyWeightLb", "Poids au réveil (lb)", "Morning bodyweight (lb)", true, 1500],
  ["waistIn", "Tour de taille au nombril (po)", "Waist at navel (in)", true, 200],
  ["chestIn", "Poitrine (po)", "Chest (in)", false, 200],
  ["hipsIn", "Hanches (po)", "Hips (in)", false, 200],
  ["rightArmIn", "Bras droit fléchi (po)", "Right flexed arm (in)", false, 200],
  ["rightThighIn", "Cuisse droite (po)", "Right thigh (in)", false, 200],
] as const;

const photoFields = [
  ["front", "Face", "Front"],
  ["side", "Profil", "Side"],
  ["back", "Dos", "Back"],
] as const;

const movementLabels: Record<WeekZeroMovementKey, [string, string]> = {
  squat: ["Squat", "Squat"],
  deadlift: ["Soulevé de terre", "Deadlift"],
  horizontalPress: ["Poussée horizontale", "Horizontal press"],
  verticalPress: ["Poussée verticale", "Vertical press"],
  cableRow: ["Tirage à la poulie", "Cable row"],
  pullUps: ["Tractions", "Pull-ups"],
  lunge: ["Fente", "Lunge"],
  legPress: ["Presse à jambes", "Leg press"],
};

const variantLabels: Record<string, [string, string]> = {
  BARBELL_SQUAT: ["Squat à la barre", "Barbell squat"],
  DUMBBELL_SQUAT: ["Squat avec haltère(s)", "Dumbbell squat"],
  BARBELL_DEADLIFT: ["Soulevé de terre à la barre", "Barbell deadlift"],
  DUMBBELL_DEADLIFT: ["Soulevé de terre avec haltères", "Dumbbell deadlift"],
  BENCH_PRESS: ["Développé couché à la barre", "Barbell bench press"],
  DUMBBELL_PRESS: ["Développé couché avec haltères", "Dumbbell press"],
  BARBELL_OVERHEAD_PRESS: ["Développé vertical à la barre", "Barbell overhead press"],
  DUMBBELL_SHOULDER_PRESS: ["Développé épaules avec haltères", "Dumbbell shoulder press"],
  CABLE_ROW: ["Tirage à la poulie", "Cable row"],
  PULL_UPS: ["Tractions", "Pull-ups"],
  BODYWEIGHT_LUNGE: ["Fente au poids du corps", "Bodyweight lunge"],
  BARBELL_LUNGE: ["Fente à la barre", "Barbell lunge"],
  DUMBBELL_LUNGE: ["Fente avec haltères", "Dumbbell lunge"],
  LEG_PRESS: ["Presse à jambes", "Leg press"],
};

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

const legacyDays = [
  ["MONDAY", "Lundi", "Monday"], ["TUESDAY", "Mardi", "Tuesday"],
  ["WEDNESDAY", "Mercredi", "Wednesday"], ["THURSDAY", "Jeudi", "Thursday"],
  ["FRIDAY", "Vendredi", "Friday"], ["SATURDAY", "Samedi", "Saturday"],
  ["SUNDAY", "Dimanche", "Sunday"],
] as const;

const emptyLoad = (): WeekZeroLoadEntry => ({
  status: "NOT_STARTED", variant: null, load: null, unit: null, mode: null,
  reps: null, rir: null, reason: null, note: null,
});
const nullableNumber = (value: string) => value === "" ? null : Number(value);

async function requestAcquisition(
  path: string,
  options: { body?: unknown; method?: string; signal?: AbortSignal } = {},
): Promise<WeekZeroAcquisitionSnapshot> {
  const response = await fetch(path, {
    method: options.method ?? "GET", cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(15_000),
    ...(options.body === undefined ? {} : {
      headers: { "content-type": "application/json" }, body: JSON.stringify(options.body),
    }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const payload = await response.json();
  return weekZeroAcquisitionSnapshotSchema.parse(payload.data?.acquisition);
}

async function requestLegacyAssessment(signal: AbortSignal): Promise<InitialAssessmentSnapshot> {
  const response = await fetch("/api/v1/client/week-zero", { cache: "no-store", signal });
  if (!response.ok) throw new Error(String(response.status));
  const payload = await response.json();
  return initialAssessmentSnapshotSchema.parse(payload.data?.assessment);
}

function commandKey(ref: { current: Command | null }, payload: unknown) {
  const fingerprint = JSON.stringify(payload);
  if (ref.current?.fingerprint !== fingerprint) ref.current = { fingerprint, key: crypto.randomUUID() };
  return ref.current.key;
}

function allowedModes(movement: WeekZeroMovementKey, variant: string | null) {
  if (movement === "pullUps") return ["BODYWEIGHT", "ASSISTED", "ADDED"] as const;
  if (!variant || !(variant in WEEK_ZERO_VARIANT_LOAD_MODES)) return [];
  return WEEK_ZERO_VARIANT_LOAD_MODES[variant as keyof typeof WEEK_ZERO_VARIANT_LOAD_MODES];
}

function loadIsComplete(movement: WeekZeroMovementKey, entry: WeekZeroLoadEntry) {
  if (entry.note !== null && entry.note.trim().length > 1000) return false;
  if (entry.status === "NOT_PERFORMED") {
    return Boolean(entry.reason?.trim()) && entry.reason!.trim().length <= 500;
  }
  if (entry.status !== "DONE" || !entry.variant || !entry.mode || entry.reps === null ||
      !Number.isInteger(entry.reps) || entry.reps < 1 || entry.reps > 100 ||
      (entry.rir !== null && (!Number.isInteger(entry.rir) || entry.rir < 0 || entry.rir > 10))) return false;
  if (!WEEK_ZERO_MOVEMENT_VARIANTS[movement].includes(entry.variant as never)) return false;
  if (!allowedModes(movement, entry.variant).includes(entry.mode as never)) return false;
  if (entry.mode === "BODYWEIGHT") return entry.load === null && entry.unit === null;
  return entry.load !== null && Number.isFinite(entry.load) && entry.load > 0 && entry.load <= 10_000 &&
    Number(entry.load.toFixed(3)) === entry.load && entry.unit !== null;
}

function measurementsAreComplete(measurements: WeekZeroAcquisitionResponses["measurements"]) {
  const valid = (value: number | null, maximum: number, required = false) =>
    value === null ? !required : Number.isFinite(value) && value > 0 && value <= maximum;
  return valid(measurements.bodyWeightLb, 1_500, true) && valid(measurements.waistIn, 200, true) &&
    valid(measurements.chestIn, 200) && valid(measurements.hipsIn, 200) &&
    valid(measurements.rightArmIn, 200) && valid(measurements.rightThighIn, 200) &&
    (measurements.other === null || measurements.other.trim().length <= 1_000);
}

function cardioIsComplete(cardio: WeekZeroAcquisitionResponses["cardio"]) {
  if (cardio.notes !== null && cardio.notes.trim().length > 1_000) return false;
  if (cardio.status === "NOT_PERFORMED") {
    return Boolean(cardio.reason?.trim()) && cardio.reason!.trim().length <= 500;
  }
  if (cardio.status !== "DONE" || cardio.reason !== null) return false;
  return cardio.age !== null && Number.isInteger(cardio.age) && cardio.age >= 16 && cardio.age <= 100 &&
    cardio.weightKg !== null && cardio.weightKg >= 31.75 && cardio.weightKg <= 317.52 &&
    Number(cardio.weightKg.toFixed(3)) === cardio.weightKg &&
    (cardio.sex === "MALE" || cardio.sex === "FEMALE") &&
    (cardio.trainingLevel === "HIGHLY_TRAINED" || cardio.trainingLevel === "NOT_HIGHLY_TRAINED") &&
    cardio.totalSeconds !== null && cardio.totalSeconds >= 240 && cardio.totalSeconds <= 1_200 &&
    Number(cardio.totalSeconds.toFixed(1)) === cardio.totalSeconds;
}

function cardioInputsMatch(
  current: WeekZeroAcquisitionResponses["cardio"],
  saved: WeekZeroAcquisitionResponses["cardio"],
) {
  return current.status === "DONE" && saved.status === "DONE" &&
    current.age === saved.age && current.weightKg === saved.weightKg &&
    current.sex === saved.sex && current.trainingLevel === saved.trainingLevel &&
    current.totalSeconds === saved.totalSeconds;
}

function mobilityIsComplete(mobility: WeekZeroAcquisitionResponses["mobility"]) {
  const answerComplete = (answer: string) => answer === "NO" || answer === "YES" || answer === "NOT_PERFORMED";
  const noteComplete = (note: string | null) => Boolean(note?.trim()) && note!.trim().length <= 1_000;
  return painFields.every(([field]) => answerComplete(mobility[field])) &&
    mobilityFields.every(([field]) => noteComplete(mobility[field]));
}

function sectionCompletion(responses: WeekZeroAcquisitionResponses, submitted: boolean) {
  return [
    responses.instructionsAccepted,
    photoFields.every(([slot]) => responses.photos[slot] !== null) &&
      (responses.photos.notes === null || responses.photos.notes.trim().length <= 1_000),
    measurementsAreComplete(responses.measurements),
    WEEK_ZERO_MOVEMENT_KEYS.every((movement) => loadIsComplete(movement, responses.loads[movement])),
    cardioIsComplete(responses.cardio),
    mobilityIsComplete(responses.mobility),
    submitted,
  ];
}

export function ClientWeekZero() {
  const [client, setClient] = useState<ClientDashboard | null>(null);
  const [assessment, setAssessment] = useState<WeekZeroAcquisitionSnapshot | null>(null);
  const [legacy, setLegacy] = useState<InitialAssessmentSnapshot | null>(null);
  const [responses, setResponses] = useState<WeekZeroAcquisitionResponses | null>(null);
  const [step, setStep] = useState(0);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [savedNotice, setSavedNotice] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [photoRetry, setPhotoRetry] = useState<PhotoAttempt | null>(null);
  const leavingIntentionally = useRef(false);
  const saveCommand = useRef<Command | null>(null);
  const submitCommand = useRef<Command | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const french = client?.locale !== "en-CA";
  const t = (fr: string, en: string) => french ? fr : en;
  const submitted = assessment?.status === "SUBMITTED";
  const dirty = responses !== null && assessment !== null && JSON.stringify(responses) !== JSON.stringify(assessment.responses);
  const titles = [
    t("Directives", "Instructions"), t("Photos", "Photos"), t("Mesures", "Measurements"),
    t("Calibration", "Calibration"), t("Cardio Concept2", "Concept2 cardio"),
    t("Mobilité", "Mobility"), t("Vérifier et transmettre", "Review and submit"),
  ];
  const completedSteps = useMemo(() => responses ? sectionCompletion(responses, Boolean(submitted)) : [], [responses, submitted]);
  const completedCount = completedSteps.filter(Boolean).length;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setFailed(false);
    Promise.all([
      fetch("/api/v1/client/me", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()).client as ClientDashboard;
      }),
      requestAcquisition("/api/v1/client/week-zero/acquisition", { signal: controller.signal }),
      requestLegacyAssessment(controller.signal),
    ]).then(([profile, record, legacyRecord]) => {
      if (!active) return;
      setClient(profile); setAssessment(record); setResponses(record.responses); setLegacy(legacyRecord);
      setConflict(false); setError(null); setSavedNotice(false); setSessionExpired(false); setPhotoRetry(null);
    }).catch((caught) => {
      if (!active) return;
      const code = caught instanceof Error ? caught.message : "503";
      if (code === "401" || code === "403") {
        leavingIntentionally.current = true; window.location.replace("/client-login");
      } else setFailed(true);
    }).finally(() => clearTimeout(timeout));
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
          !window.confirm(french ? "Tes modifications ne sont pas enregistrées. Quitter cette page ?" : "Your changes have not been saved. Leave this page?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", followLink, true); };
  }, [dirty, french]);

  function editSection<K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) {
    setResponses((current) => current && ({ ...current, [section]: value }));
    setSavedNotice(false); setError(null);
  }
  function editLoad(movement: WeekZeroMovementKey, next: WeekZeroLoadEntry) {
    if (responses) editSection("loads", { ...responses.loads, [movement]: next });
  }
  function goToStep(next: number) {
    setStep(next); setStepsOpen(false); setTimeout(() => heading.current?.focus(), 0);
  }
  function readableError(code: string) {
    if (code === "409") return t("Une version plus récente existe ou cette semaine zéro a déjà été transmise. Tes saisies restent affichées. Recharge la version enregistrée avant de continuer.", "A newer version exists or this Week Zero has already been submitted. Your entries remain here. Reload the saved version before continuing.");
    if (["400", "413", "415", "422"].includes(code)) return t("Vérifie les valeurs, le format des photos et les champs demandés. Tes saisies restent affichées.", "Check the values, photo format and required fields. Your entries remain here.");
    if (code === "401" || code === "403") return t("Ta session n’est plus valide. Reconnecte-toi pour continuer. Seules les données déjà enregistrées sont conservées sur le serveur.", "Your session is no longer valid. Sign in again to continue. Only previously saved data is retained on the server.");
    return t("La confirmation n’a pas été reçue. Tes saisies restent affichées. Réessaie la même action pour vérifier l’enregistrement sans doublon.", "Confirmation was not received. Your entries remain here. Retry the same action to confirm the save without creating a duplicate.");
  }
  function handleRequestError(caught: unknown) {
    const code = caught instanceof Error ? caught.message : "503";
    if (code === "409") setConflict(true);
    if (code === "401" || code === "403") setSessionExpired(true);
    setError(readableError(code));
  }
  async function savePending(base: WeekZeroAcquisitionSnapshot) {
    if (!responses) return base;
    const parsed = weekZeroAcquisitionResponsesSchema.safeParse(responses);
    if (!parsed.success) {
      const issuePath = parsed.error.issues[0]?.path.join(".");
      const named = issuePath ? formRef.current?.querySelector<HTMLElement>(`[name="${issuePath}"]`) : null;
      const invalid = named ?? [...(formRef.current?.querySelectorAll<HTMLElement>(":invalid") ?? [])]
        .find((element) => !("value" in element) || String((element as HTMLInputElement).value).length > 0);
      setTimeout(() => invalid?.focus(), 0);
      throw new Error("400");
    }
    if (!dirty && base.status !== "NOT_STARTED") return base;
    const draft = { expectedVersion: base.version, responses: parsed.data };
    const current = await requestAcquisition("/api/v1/client/week-zero/acquisition", {
      method: "PUT", body: { ...draft, clientMutationId: commandKey(saveCommand, draft) },
    });
    setAssessment(current); setResponses(current.responses); saveCommand.current = null;
    return current;
  }
  async function persist(send: boolean) {
    if (!assessment || !responses || busy || conflict || submitted) return;
    if (send && !completeWeekZeroAcquisitionResponsesSchema.safeParse(responses).success) {
      setError(t("Il reste des éléments à compléter ou à marquer « non réalisé » avec une raison avant la transmission.", "Some items still need to be completed or marked “not performed” with a reason before submission."));
      return;
    }
    if (send && !window.confirm(t("Transmettre cette semaine zéro à ton Coach ? Tu ne pourras plus modifier ces réponses.", "Submit this Week Zero to your Coach? You will no longer be able to edit these answers."))) return;
    setBusy(true); setError(null); setSavedNotice(false);
    try {
      let current = await savePending(assessment);
      if (send) {
        const submission = { expectedVersion: current.version };
        current = await requestAcquisition("/api/v1/client/week-zero/acquisition/submit", {
          method: "POST", body: { ...submission, clientMutationId: commandKey(submitCommand, submission) },
        });
        setAssessment(current); setResponses(current.responses); submitCommand.current = null;
      }
      setSavedNotice(true);
    } catch (caught) { handleRequestError(caught); } finally { setBusy(false); }
  }
  async function uploadPhoto(slot: WeekZeroPhotoSlot, file: File, retry?: PhotoAttempt) {
    if (!assessment || busy || conflict || submitted) return;
    if (!retry && (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 4 * 1024 * 1024)) {
      setError(t("Choisis une photo JPEG, PNG ou WebP de 4 Mo maximum.", "Choose a JPEG, PNG or WebP photo no larger than 4 MB.")); return;
    }
    setBusy(true); setError(null); setSavedNotice(false);
    try {
      const current = retry ? assessment : await savePending(assessment);
      const pending = retry ?? { assetId: crypto.randomUUID(), expectedVersion: current.version, file, key: crypto.randomUUID(), slot };
      const form = new FormData();
      form.set("slot", pending.slot); form.set("assetId", pending.assetId);
      form.set("expectedVersion", String(pending.expectedVersion)); form.set("clientMutationId", pending.key); form.set("file", pending.file);
      setPhotoRetry(pending);
      const response = await fetch("/api/v1/client/week-zero/photos", { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(String(response.status));
      const parsed = weekZeroPhotoUploadResponseSchema.parse(await response.json());
      if (parsed.data.acquisition.responses.photos[pending.slot] !== pending.assetId) throw new Error("502");
      setAssessment(parsed.data.acquisition); setResponses(parsed.data.acquisition.responses);
      setPhotoRetry(null); setSavedNotice(true); saveCommand.current = null;
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "503";
      if (["400", "413", "415", "422"].includes(code)) setPhotoRetry(null);
      handleRequestError(caught);
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (dirty && !window.confirm(t("Tes modifications ne sont pas enregistrées. Te déconnecter ?", "Your changes have not been saved. Sign out?"))) return;
    setBusy(true);
    const received = await requestClientLogout((destination) => { leavingIntentionally.current = true; window.location.replace(destination); });
    if (!received) { setError(t("Déconnexion impossible. Réessaie.", "Unable to sign out. Try again.")); setBusy(false); }
  }
  const missing = responses ? completionMessages(responses, french) : [];

  return <ClientVisualShell current="week-zero" name={client?.displayName} french={french} documentNavigation
    accountAction={<button className="fe-button" disabled={busy} onClick={() => void signOut()}>{t("Se déconnecter", "Sign out")}</button>}>
    <div className={styles.page} data-week-zero-checkpoint="acquisition-v1">
      <header className={styles.intro}><p className="fe-kicker">Week Zero</p><h1 className="fe-title">{t("Ta semaine zéro", "Your Week Zero")}</h1><p>{t("Documente un point de départ réel et reproductible avant que ton Coach construise la suite.", "Document a real, repeatable starting point before your Coach builds what comes next.")}</p></header>
      {error && <Feedback>{error}</Feedback>}
      {sessionExpired && <Link className="fe-button" href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>}
      {conflict && <button className="fe-button" onClick={() => { if (window.confirm(t("Recharger remplacera les saisies affichées par la dernière version enregistrée. Continuer ?", "Reloading replaces the entries shown with the latest saved version. Continue?"))) setAttempt((value) => value + 1); }}>{t("Recharger la version enregistrée", "Reload saved version")}</button>}
      {photoRetry && !conflict && <button className="fe-button" disabled={busy} onClick={() => void uploadPhoto(photoRetry.slot, photoRetry.file, photoRetry)}>{t("Réessayer l’envoi de la photo", "Retry photo upload")}</button>}
      {failed ? <><Feedback>{t("Impossible de charger ta semaine zéro. Aucune donnée n’a été remplacée.", "Unable to load your Week Zero. No data was replaced.")}</Feedback><button className="fe-button" onClick={() => setAttempt((value) => value + 1)}>{t("Réessayer", "Try again")}</button></> : !assessment || !responses ? <Loading>{t("Chargement de la semaine zéro…", "Loading Week Zero…")}</Loading> : <>
        {!submitted && <><div className={styles.progressPanel}><div><strong>{t("Progression enregistrable", "Saveable progress")}</strong><span>{completedCount} {t("sur", "of")} 7</span></div><progress max={7} value={completedCount} aria-label={t("Progression de la semaine zéro", "Week Zero progress")} /><p>{t("Le vert confirme uniquement les étapes dont les données sont complètes.", "Green only marks steps whose data is complete.")}</p></div>
          <nav className={styles.stepNavigation} aria-label={t("Étapes de la semaine zéro", "Week Zero steps")}><div className={styles.mobileSteps}><p>{step + 1} {t("sur", "of")} {titles.length} · {titles[step]}</p><button type="button" className={styles.stepToggle} aria-expanded={stepsOpen} aria-controls="week-zero-steps" onClick={() => setStepsOpen(!stepsOpen)}>{stepsOpen ? t("Masquer les étapes", "Hide steps") : t("Voir les étapes", "View steps")} <span aria-hidden="true">{stepsOpen ? "−" : "+"}</span></button></div>
            <ol id="week-zero-steps" className={styles.steps} data-expanded={stepsOpen}>{titles.map((title, index) => <li key={title} data-testid={`week-zero-step-${index + 1}`} data-complete={completedSteps[index]}><button className={styles.stepButton} type="button" aria-current={step === index ? "step" : undefined} disabled={busy} onClick={() => goToStep(index)}><span className={styles.stepNumber} aria-hidden="true">{completedSteps[index] ? "✓" : index + 1}</span><span><span className="fe-sr-only">{index + 1}. </span>{title}</span></button></li>)}</ol>
          </nav></>}
        <div className={styles.statePanel}><p className={styles.status} role="status" aria-live="polite" data-state={busy ? "saving" : submitted ? "submitted" : dirty ? "dirty" : assessment.status.toLowerCase()}><Icon name={submitted ? "check" : busy ? "clock" : "alert"} /><span>{busy ? t("Enregistrement en cours…", "Saving…") : submitted ? t("Semaine zéro transmise au Coach", "Week Zero submitted to your Coach") : dirty ? t("Modifications non enregistrées", "Unsaved changes") : assessment.status === "DRAFT" ? t("Brouillon enregistré — pas encore transmis au Coach", "Draft saved — not yet submitted to your Coach") : t("Semaine zéro non commencée", "Week Zero not started")}{savedNotice && !submitted ? t(". Sauvegarde confirmée.", ". Save confirmed.") : ""}</span></p>{!submitted && <p className={styles.privacy}><Icon name="eye" /><span>{t("Les photos restent privées. Ton Coach voit la semaine zéro seulement après sa transmission.", "Photos remain private. Your Coach sees Week Zero only after submission.")}</span></p>}</div>
        {submitted ? <><Feedback tone="success">{t("Ton Coach peut maintenant consulter cette semaine zéro. Les réponses et photos transmises sont conservées en lecture seule.", "Your Coach can now view this Week Zero. Submitted answers and photos are kept read-only.")}</Feedback><AcquisitionReview responses={responses} assessment={assessment} french={french} /><Link className="fe-button" href="/client">{t("Retour à mon portail", "Back to my portal")}</Link></> : <form ref={formRef} noValidate aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void persist(false); }}><fieldset className={styles.panel} disabled={busy || conflict || Boolean(photoRetry)}><legend className="fe-sr-only">{titles[step]}</legend><h2 className="fe-title" ref={heading} tabIndex={-1}>{titles[step]}</h2>
          {step === 0 && <InstructionsStep responses={responses} setResponses={editSection} french={french} />}
          {step === 1 && <PhotosStep responses={responses} uploadPhoto={uploadPhoto} editSection={editSection} french={french} />}
          {step === 2 && <MeasurementsStep responses={responses} editSection={editSection} french={french} />}
          {step === 3 && <CalibrationStep responses={responses} editLoad={editLoad} french={french} />}
          {step === 4 && <CardioStep responses={responses} editSection={editSection} assessment={assessment} french={french} />}
          {step === 5 && <MobilityStep responses={responses} editSection={editSection} french={french} />}
          {step === 6 && <><AcquisitionReview responses={responses} assessment={assessment} french={french} />{missing.length > 0 ? <Feedback>{t("À compléter avant de transmettre : ", "Complete before submitting: ")}{missing.join("; ")}</Feedback> : <Feedback tone="info">{t("Toutes les étapes requises sont documentées. Vérifie tes réponses puis confirme la transmission à ton Coach.", "All required steps are documented. Review your answers, then confirm submission to your Coach.")}</Feedback>}<button className="fe-button fe-button-primary fe-button-wide" type="button" disabled={busy || conflict || missing.length > 0} onClick={() => void persist(true)}>{t("Transmettre ma semaine zéro au Coach", "Submit my Week Zero to my Coach")}</button></>}
        </fieldset><div className={styles.actions}><button className="fe-button" type="submit" disabled={busy || conflict || Boolean(photoRetry)}>{t("Enregistrer mon brouillon", "Save my draft")}</button>{step > 0 && <button className="fe-button" type="button" disabled={busy} onClick={() => goToStep(step - 1)}>{t("Précédent", "Previous")}</button>}{step < 6 && <button className="fe-button fe-button-primary" type="button" disabled={busy} onClick={() => goToStep(step + 1)}>{t("Continuer", "Continue")}</button>}</div></form>}
        {legacy?.status === "SUBMITTED" && <LegacyArchive assessment={legacy} french={french} />}
      </>}
    </div>
  </ClientVisualShell>;
}

function InstructionsStep({ responses, setResponses, french }: { responses: WeekZeroAcquisitionResponses; setResponses: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <div className={styles.instructions}><div className={styles.warning} role="note"><Icon name="alert" /><div><strong>{t("Calibration : arrête chaque série avec 2 à 4 répétitions en réserve (RIR).", "Calibration: stop each set with 2 to 4 repetitions in reserve (RIR).")}</strong><p>{t("Ce n’est pas un test maximal. Si un mouvement est douloureux ou non sécuritaire, marque-le non réalisé et explique pourquoi.", "This is not a max test. If a movement is painful or unsafe, mark it not performed and explain why.")}</p></div></div><div className={styles.warning} role="note"><Icon name="clock" /><div><strong>{t("Le 2 000 m Concept2 est un test d’effort distinct.", "The Concept2 2,000 m is a separate effort test.")}</strong><p>{t("Fais-le seulement si tu peux ramer en sécurité. Tu peux aussi le marquer non réalisé avec une raison.", "Only do it if you can row safely. You can also mark it not performed and provide a reason.")}</p></div></div><ul><li>{t("Prends les photos dans un espace privé, avec un éclairage stable.", "Take photos in a private space with consistent lighting.")}</li><li>{t("Inscris les charges réellement utilisées, par main ou au total selon l’exercice.", "Record loads actually used, per hand or total depending on the exercise.")}</li><li>{t("Réponds à la mobilité après ta séance de gym, sans provoquer de douleur.", "Complete mobility after your gym session without provoking pain.")}</li></ul><label className={styles.acceptance}><input type="checkbox" checked={responses.instructionsAccepted} onChange={(event) => setResponses("instructionsAccepted", event.target.checked)} /><span>{t("J’ai lu les directives et je vais signaler tout élément non réalisé.", "I have read the instructions and will identify anything not performed.")}</span></label></div>;
}

function PhotosStep({ responses, uploadPhoto, editSection, french }: { responses: WeekZeroAcquisitionResponses; uploadPhoto: (slot: WeekZeroPhotoSlot, file: File) => Promise<void>; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><p>{t("Ajoute une photo de face, de profil et de dos. Le fichier n’est confirmé qu’après son enregistrement privé sur le serveur.", "Add front, side and back photos. A file is only confirmed after it is privately stored on the server.")}</p><div className={styles.photoGrid}>{photoFields.map(([slot, fr, en]) => { const assetId = responses.photos[slot]; return <section className={styles.photoCard} key={slot} data-photo-status={assetId ? "uploaded" : "missing"}><h3>{t(fr, en)}</h3>{assetId ? <Image unoptimized width={300} height={400} src={`/api/v1/client/week-zero/photos?slot=${slot}&assetId=${assetId}`} alt={t(`Photo ${fr.toLowerCase()} enregistrée`, `Saved ${en.toLowerCase()} photo`)} /> : <div className={styles.photoPlaceholder}><Icon name="eye" /><span>{t("Aucune photo enregistrée", "No saved photo")}</span></div>}<label className={styles.fileField}><span>{assetId ? t("Remplacer la photo", "Replace photo") : t("Choisir une photo", "Choose a photo")}</span><input data-testid={`photo-${slot}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadPhoto(slot, file); }} /></label><small>{assetId ? t("Enregistrée dans l’espace privé", "Saved in private storage") : t("JPEG, PNG ou WebP · 4 Mo max.", "JPEG, PNG or WebP · 4 MB max.")}</small></section>; })}</div><label className={`${styles.field} ${styles.wide}`}>{t("Notes sur les photos (facultatif)", "Photo notes (optional)")}<textarea maxLength={1000} value={responses.photos.notes ?? ""} onChange={(event) => editSection("photos", { ...responses.photos, notes: event.target.value || null })} /></label></>;
}

function MeasurementsStep({ responses, editSection, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><div className={styles.measurementLead}><div><strong>{t("Tes mensurations de départ", "Your starting measurements")}</strong><span>{t("À prendre dès aujourd’hui", "Take them today")}</span></div><p>{t("Le poids et le tour de taille sont requis. Poitrine, hanches, bras et cuisse sont facultatifs, mais utiles comme repères.", "Weight and waist are required. Chest, hips, arm and thigh are optional, but useful as reference points.")}</p></div><div className={styles.grid}>{measurementFields.map(([key, fr, en, required, max]) => <label className={styles.field} key={key}>{t(fr, en)}{required ? " *" : <small>{t("Facultatif", "Optional")}</small>}<input name={`measurements.${key}`} type="number" inputMode="decimal" min="0.01" max={max} step="any" required={required} value={responses.measurements[key] ?? ""} onChange={(event) => editSection("measurements", { ...responses.measurements, [key]: nullableNumber(event.target.value) })} /></label>)}<label className={`${styles.field} ${styles.wide}`}>{t("Autres précisions (facultatif)", "Other details (optional)")}<textarea maxLength={1000} value={responses.measurements.other ?? ""} onChange={(event) => editSection("measurements", { ...responses.measurements, other: event.target.value || null })} /></label></div></>;
}

function CalibrationStep({ responses, editLoad, french }: { responses: WeekZeroAcquisitionResponses; editLoad: (movement: WeekZeroMovementKey, next: WeekZeroLoadEntry) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><div className={styles.warning} role="note"><Icon name="alert" /><p>{t("Garde 2 à 4 RIR. Inscris le résultat de chaque mouvement ou choisis « non réalisé » avec une raison. RIR reste facultatif.", "Keep 2 to 4 RIR. Record each movement result or choose “not performed” with a reason. RIR remains optional.")}</p></div><div className={styles.movementList}>{WEEK_ZERO_MOVEMENT_KEYS.map((movement, index) => { const entry = responses.loads[movement]; const modes = allowedModes(movement, entry.variant); return <fieldset className={styles.movementCard} data-testid={`calibration-${movement}`} key={movement} data-complete={loadIsComplete(movement, entry)}><legend><span>{String(index + 1).padStart(2, "0")}</span>{t(...movementLabels[movement])}</legend><label className={styles.field}>{t("Résultat", "Result")} *<select aria-label={t(`Résultat — ${movementLabels[movement][0]}`, `Result — ${movementLabels[movement][1]}`)} value={entry.status} onChange={(event) => { const status = event.target.value as WeekZeroLoadEntry["status"]; editLoad(movement, status === "NOT_STARTED" ? emptyLoad() : status === "NOT_PERFORMED" ? { ...emptyLoad(), status, reason: entry.reason, note: entry.note } : { ...emptyLoad(), status, note: entry.note }); }}><option value="NOT_STARTED">{t("Choisir", "Choose")}</option><option value="DONE">{t("Réalisé", "Done")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>{entry.status === "NOT_PERFORMED" && <label className={`${styles.field} ${styles.wide}`}>{t("Raison", "Reason")} *<textarea maxLength={500} required value={entry.reason ?? ""} onChange={(event) => editLoad(movement, { ...entry, reason: event.target.value || null })} /></label>}{entry.status === "DONE" && <div className={styles.calibrationGrid}><label className={styles.field}>{t("Variante utilisée", "Variant used")} *<select value={entry.variant ?? ""} required onChange={(event) => editLoad(movement, { ...entry, variant: event.target.value || null, mode: null, load: null, unit: null })}><option value="">{t("Choisir la variante", "Choose variant")}</option>{WEEK_ZERO_MOVEMENT_VARIANTS[movement].map((variant) => <option value={variant} key={variant}>{t(...variantLabels[variant])}</option>)}</select></label><label className={styles.field}>{t("Charge indiquée", "Load basis")} *<select value={entry.mode ?? ""} required onChange={(event) => { const mode = event.target.value as WeekZeroLoadEntry["mode"]; editLoad(movement, { ...entry, mode, ...(mode === "BODYWEIGHT" ? { load: null, unit: null } : {}) }); }}><option value="">{t("Choisir", "Choose")}</option>{modes.map((mode) => <option value={mode} key={mode}>{mode === "TOTAL" ? t("Charge totale", "Total load") : mode === "PER_HAND" ? t("Charge par main", "Load per hand") : mode === "BODYWEIGHT" ? t("Poids du corps", "Bodyweight") : mode === "ASSISTED" ? t("Assistance", "Assisted") : t("Charge ajoutée", "Added load")}</option>)}</select></label>{entry.mode !== "BODYWEIGHT" && <><label className={styles.field}>{t("Charge", "Load")} *<input type="number" inputMode="decimal" min="0.001" max="10000" step="0.001" required value={entry.load ?? ""} onChange={(event) => editLoad(movement, { ...entry, load: nullableNumber(event.target.value) })} /></label><label className={styles.field}>{t("Unité", "Unit")} *<select value={entry.unit ?? ""} required onChange={(event) => editLoad(movement, { ...entry, unit: (event.target.value || null) as WeekZeroLoadEntry["unit"] })}><option value="">{t("Choisir", "Choose")}</option><option value="LB">lb</option><option value="KG">kg</option></select></label></>}<label className={styles.field}>{movement === "lunge" ? t("Répétitions par côté", "Repetitions per side") : t("Répétitions", "Repetitions")} *<input type="number" inputMode="numeric" min="1" max="100" step="1" required value={entry.reps ?? ""} onChange={(event) => editLoad(movement, { ...entry, reps: nullableNumber(event.target.value) })} /></label><label className={styles.field}>{t("RIR (facultatif)", "RIR (optional)")}<input type="number" inputMode="numeric" min="0" max="10" step="1" value={entry.rir ?? ""} onChange={(event) => editLoad(movement, { ...entry, rir: nullableNumber(event.target.value) })} /></label></div>}{entry.status !== "NOT_STARTED" && <label className={`${styles.field} ${styles.wide}`}>{t("Note (facultatif)", "Note (optional)")}<textarea maxLength={1000} value={entry.note ?? ""} onChange={(event) => editLoad(movement, { ...entry, note: event.target.value || null })} /></label>}</fieldset>; })}</div></>;
}

function CardioStep({ responses, editSection, assessment, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; assessment: WeekZeroAcquisitionSnapshot; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en; const cardio = responses.cardio;
  const minutes = cardio.totalSeconds === null ? "" : Math.floor(cardio.totalSeconds / 60);
  const seconds = cardio.totalSeconds === null ? "" : Number((cardio.totalSeconds % 60).toFixed(1));
  const setTime = (nextMinutes: number | null, nextSeconds: number | null) => editSection("cardio", { ...cardio, totalSeconds: nextMinutes === null && nextSeconds === null ? null : (nextMinutes ?? 0) * 60 + (nextSeconds ?? 0) });
  return <><div className={styles.protocol}><span>Concept2</span><strong>2 000 m</strong><p>{t("Rameur Concept2 · 2 000 m au meilleur effort que tu peux soutenir en sécurité, distinct de la calibration 2–4 RIR.", "Concept2 rower · a 2,000 m best sustainable effort, separate from the 2–4 RIR calibration.")}</p></div><label className={styles.field}>{t("Résultat du test", "Test result")} *<select value={cardio.status} onChange={(event) => { const status = event.target.value as typeof cardio.status; editSection("cardio", status === "NOT_STARTED" ? { ...cardio, status, reason: null, age: null, weightKg: null, sex: null, trainingLevel: null, totalSeconds: null } : status === "NOT_PERFORMED" ? { ...cardio, status, age: null, weightKg: null, sex: null, trainingLevel: null, totalSeconds: null } : { ...cardio, status, reason: null }); }}><option value="NOT_STARTED">{t("Choisir", "Choose")}</option><option value="DONE">{t("Réalisé", "Done")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>{cardio.status === "NOT_PERFORMED" && <label className={`${styles.field} ${styles.wide}`}>{t("Raison", "Reason")} *<textarea maxLength={500} required value={cardio.reason ?? ""} onChange={(event) => editSection("cardio", { ...cardio, reason: event.target.value || null })} /></label>}{cardio.status === "DONE" && <div className={styles.grid}><label className={styles.field}>{t("Âge lors du test", "Age at test")} *<input type="number" min="16" max="100" step="1" required value={cardio.age ?? ""} onChange={(event) => editSection("cardio", { ...cardio, age: nullableNumber(event.target.value) })} /></label><label className={styles.field}>{t("Poids lors du test (kg)", "Weight at test (kg)")} *<input type="number" min="31.75" max="317.52" step="0.001" required value={cardio.weightKg ?? ""} onChange={(event) => editSection("cardio", { ...cardio, weightKg: nullableNumber(event.target.value) })} /></label><label className={styles.field}>{t("Sexe de référence du calcul", "Calculation reference sex")} *<select required value={cardio.sex ?? ""} onChange={(event) => editSection("cardio", { ...cardio, sex: (event.target.value || null) as typeof cardio.sex })}><option value="">{t("Choisir", "Choose")}</option><option value="MALE">{t("Homme", "Male")}</option><option value="FEMALE">{t("Femme", "Female")}</option></select></label><label className={styles.field}>{t("Niveau d’entraînement", "Training level")} *<select required value={cardio.trainingLevel ?? ""} onChange={(event) => editSection("cardio", { ...cardio, trainingLevel: (event.target.value || null) as typeof cardio.trainingLevel })}><option value="">{t("Choisir", "Choose")}</option><option value="HIGHLY_TRAINED">{t("Très entraîné en aviron", "Highly trained in rowing")}</option><option value="NOT_HIGHLY_TRAINED">{t("Pas très entraîné en aviron", "Not highly trained in rowing")}</option></select></label><label className={styles.field}>{t("Temps — minutes", "Time — minutes")} *<input type="number" min="0" max="20" step="1" required value={minutes} onChange={(event) => setTime(nullableNumber(event.target.value), seconds === "" ? null : Number(seconds))} /></label><label className={styles.field}>{t("Temps — secondes", "Time — seconds")} *<input type="number" min="0" max="59.9" step="0.1" required value={seconds} onChange={(event) => setTime(minutes === "" ? null : Number(minutes), nullableNumber(event.target.value))} /></label></div>}{cardio.status !== "NOT_STARTED" && <label className={`${styles.field} ${styles.wide}`}>{t("Notes cardio (facultatif)", "Cardio notes (optional)")}<textarea maxLength={1000} value={cardio.notes ?? ""} onChange={(event) => editSection("cardio", { ...cardio, notes: event.target.value || null })} /></label>}{cardioInputsMatch(cardio, assessment.responses.cardio) && assessment.derived.cardio && <DerivedCardio assessment={assessment} french={french} />}</>;
}

function DerivedCardio({ assessment, french }: { assessment: WeekZeroAcquisitionSnapshot; french: boolean }) {
  const result = assessment.derived.cardio; if (!result) return null; const t = (fr: string, en: string) => french ? fr : en;
  return <aside className={styles.derived}><h3>{t("Estimation après enregistrement", "Estimate after saving")}</h3><dl><div><dt>{t("Allure / 500 m", "Pace / 500 m")}</dt><dd>{result.paceSecondsPer500.toFixed(1)} s</dd></div><div><dt>{t("Puissance moyenne", "Average power")}</dt><dd>{result.averageWatts.toFixed(1)} W</dd></div><div><dt>VO₂ max</dt><dd>{result.estimatedVo2MaxMlKgMin === null ? t("Hors plage de formule", "Outside formula range") : `${result.estimatedVo2MaxMlKgMin.toFixed(1)} ml/kg/min`}</dd></div></dl><p>{t("Estimation seulement, pas un diagnostic médical.", "Estimate only, not a medical diagnosis.")}</p></aside>;
}

function MobilityStep({ responses, editSection, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><p>{t("Réponds après ta séance de gym, selon ce que tu as observé, sans provoquer de douleur. Si un élément n’a pas pu être évalué, choisis « non réalisé ».", "Answer after your gym session based on what you observed, without provoking pain. If something could not be assessed, choose “not performed”.")}</p><div className={styles.grid}>{painFields.map(([field, fr, en]) => <label className={styles.field} key={field}>{t(fr, en)} *<select value={responses.mobility[field]} onChange={(event) => editSection("mobility", { ...responses.mobility, [field]: event.target.value as WeekZeroAcquisitionResponses["mobility"][typeof field] })}><option value="NOT_ASSESSED">{t("Choisir une réponse", "Choose an answer")}</option><option value="NO">{t("Non", "No")}</option><option value="YES">{t("Oui", "Yes")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>)}{mobilityFields.map(([field, fr, en]) => <label className={`${styles.field} ${styles.wide}`} key={field}>{t(fr, en)} *<textarea maxLength={1000} required value={responses.mobility[field] ?? ""} onChange={(event) => editSection("mobility", { ...responses.mobility, [field]: event.target.value || null })} /></label>)}</div></>;
}

function completionMessages(responses: WeekZeroAcquisitionResponses, french: boolean) {
  const t = (fr: string, en: string) => french ? fr : en; const parsed = completeWeekZeroAcquisitionResponsesSchema.safeParse(responses); if (parsed.success) return [];
  const groups = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const labels: Record<string, string> = { instructionsAccepted: t("directives", "instructions"), photos: t("trois photos", "three photos"), measurements: t("poids et tour de taille", "weight and waist"), loads: t("huit calibrations", "eight calibrations"), cardio: t("cardio Concept2", "Concept2 cardio"), mobility: t("mobilité après le gym", "post-gym mobility") };
  return [...groups].map((group) => labels[String(group)] ?? t("valeurs à vérifier", "values to check"));
}

function AcquisitionReview({ responses, assessment, french }: { responses: WeekZeroAcquisitionResponses; assessment: WeekZeroAcquisitionSnapshot; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  const empty = t("Non renseigné", "Not provided");
  const cardio = responses.cardio;
  const sex = cardio.sex === "MALE" ? t("Homme", "Male") : cardio.sex === "FEMALE" ? t("Femme", "Female") : "—";
  const trainingLevel = cardio.trainingLevel === "HIGHLY_TRAINED"
    ? t("Très entraîné en aviron", "Highly trained in rowing")
    : cardio.trainingLevel === "NOT_HIGHLY_TRAINED" ? t("Pas très entraîné en aviron", "Not highly trained in rowing") : "—";
  const cardioResult = cardio.status === "NOT_PERFORMED"
    ? `${t("Non réalisé", "Not performed")} — ${cardio.reason}`
    : cardio.status === "DONE" ? `${cardio.totalSeconds ?? "—"} s` : t("Non documenté", "Not documented");
  return <div className={styles.reviewSections}>
    <section><h3>{t("Photos et mesures", "Photos and measurements")}</h3><dl className={styles.review}>
      {photoFields.map(([slot, fr, en]) => <div key={slot}><dt>{t(fr, en)}</dt><dd>{responses.photos[slot] ? t("Enregistrée", "Saved") : t("Manquante", "Missing")}</dd></div>)}
      <div><dt>{t("Notes sur les photos", "Photo notes")}</dt><dd>{responses.photos.notes || empty}</dd></div>
      {measurementFields.map(([field, fr, en]) => <div key={field}><dt>{t(fr, en)}</dt><dd>{responses.measurements[field] ?? empty}</dd></div>)}
      <div><dt>{t("Autres précisions sur les mesures", "Other measurement details")}</dt><dd>{responses.measurements.other || empty}</dd></div>
    </dl></section>
    <section><h3>{t("Calibration — 8 mouvements", "Calibration — 8 movements")}</h3><dl className={styles.review}>
      {WEEK_ZERO_MOVEMENT_KEYS.map((movement) => {
        const entry = responses.loads[movement];
        const result = entry.status === "NOT_PERFORMED"
          ? `${t("Non réalisé", "Not performed")} — ${entry.reason}`
          : entry.status === "DONE"
            ? `${entry.variant ? t(...variantLabels[entry.variant]) : t("Variante manquante", "Missing variant")} · ${entry.reps ?? "—"} ${movement === "lunge" ? t("reps par côté", "reps per side") : "reps"} · ${entry.mode === "BODYWEIGHT" ? t("poids du corps", "bodyweight") : `${entry.load ?? "—"} ${entry.unit ?? ""} (${entry.mode === "PER_HAND" ? t("par main", "per hand") : entry.mode === "ASSISTED" ? t("assistance", "assisted") : entry.mode === "ADDED" ? t("ajoutée", "added") : t("total", "total")})`}${entry.rir === null ? "" : ` · RIR ${entry.rir}`}`
            : t("Non documenté", "Not documented");
        return <div key={movement} data-result={entry.status}><dt>{t(...movementLabels[movement])}</dt><dd>{result}{entry.note && <><br /><small>{t("Note :", "Note:")} {entry.note}</small></>}</dd></div>;
      })}
    </dl></section>
    <section><h3>{t("Cardio Concept2", "Concept2 cardio")}</h3><dl className={styles.review}>
      <div data-result={cardio.status}><dt>{t("Résultat — 2 000 m", "Result — 2,000 m")}</dt><dd>{cardioResult}</dd></div>
      <div><dt>{t("Âge / poids du test", "Test age / weight")}</dt><dd>{cardio.age ?? "—"} · {cardio.weightKg ?? "—"} kg</dd></div>
      <div><dt>{t("Référence du calcul", "Calculation reference")}</dt><dd>{sex} · {trainingLevel}</dd></div>
      <div><dt>{t("Notes cardio", "Cardio notes")}</dt><dd>{cardio.notes || empty}</dd></div>
      {cardioInputsMatch(cardio, assessment.responses.cardio) && assessment.derived.cardio && <><div><dt>{t("Allure / 500 m", "Pace / 500 m")}</dt><dd>{assessment.derived.cardio.paceSecondsPer500.toFixed(1)} s</dd></div><div><dt>{t("Puissance moyenne", "Average power")}</dt><dd>{assessment.derived.cardio.averageWatts.toFixed(1)} W</dd></div><div><dt>{t("VO₂ max estimé", "Estimated VO₂ max")}</dt><dd>{assessment.derived.cardio.estimatedVo2MaxMlKgMin === null ? t("Hors plage de formule", "Outside formula range") : `${assessment.derived.cardio.estimatedVo2MaxMlKgMin.toFixed(1)} ml/kg/min`}</dd></div></>}
    </dl></section>
    <section><h3>{t("Mobilité après le gym", "Post-gym mobility")}</h3><dl className={styles.review}>
      {painFields.map(([field, fr, en]) => <div key={field}><dt>{t(fr, en)}</dt><dd>{responses.mobility[field] === "NOT_ASSESSED" ? t("Non documenté", "Not documented") : responses.mobility[field] === "NOT_PERFORMED" ? t("Non réalisé", "Not performed") : responses.mobility[field] === "YES" ? t("Oui", "Yes") : t("Non", "No")}</dd></div>)}
      {mobilityFields.map(([field, fr, en]) => <div key={field}><dt>{t(fr, en)}</dt><dd>{responses.mobility[field] || empty}</dd></div>)}
    </dl></section>
    {assessment.submittedAt && <p className={styles.timestamp}>{t("Transmise le", "Submitted on")} {new Intl.DateTimeFormat(french ? "fr-CA" : "en-CA", { dateStyle: "long" }).format(new Date(assessment.submittedAt))}</p>}
  </div>;
}

function LegacyArchive({ assessment, french }: { assessment: InitialAssessmentSnapshot; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <details className={styles.archive}><summary><span><strong>{t("Archive — bilan initial V1", "Archive — V1 initial assessment")}</strong><small>{t("Lecture seule · ne complète pas la nouvelle semaine zéro", "Read-only · does not complete the new Week Zero")}</small></span><Icon name="arrow" /></summary><p>{t("Ces réponses historiques restent accessibles, y compris les anciennes disponibilités. Elles ne sont pas utilisées pour valider les sept nouvelles étapes.", "These historical answers remain available, including previous availability. They are not used to validate the seven new steps.")}</p><LegacyReview responses={assessment.responses} french={french} /></details>;
}

function LegacyReview({ responses, french }: { responses: InitialAssessmentResponses; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en; const empty = t("Non renseigné", "Not provided");
  const rows: [string, string][] = [...measurementFields.map(([key, fr, en]): [string, string] => [t(fr, en), String(responses.measurements[key] ?? empty)]), [t("Autres précisions", "Other details"), responses.measurements.other || empty], ...painFields.map(([key, fr, en]): [string, string] => [t(fr, en), responses.mobility[key] === "NOT_ASSESSED" ? empty : responses.mobility[key] === "YES" ? t("Oui", "Yes") : t("Non", "No")]), ...mobilityFields.map(([key, fr, en]): [string, string] => [t(fr, en), responses.mobility[key] || empty]), [t("Anciennes disponibilités", "Previous availability"), legacyDays.filter(([key]) => responses.availability.days.includes(key)).map(([, fr, en]) => t(fr, en)).join(", ") || empty], [t("Moment de la journée", "Best time of day"), responses.availability.bestTime || empty], [t("Minutes par séance", "Minutes per session"), String(responses.availability.sessionDurationMinutes ?? empty)], [t("Séances par semaine", "Sessions per week"), String(responses.availability.sessionsPerWeek ?? empty)], [t("Contraintes", "Constraints"), responses.availability.constraints || empty]];
  return <dl className={styles.review}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
