"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { calculateConcept2Result } from "@/lib/week-zero/concept2";
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
import { weekZeroCopyText, type WeekZeroCopyId } from "./week-zero-copy";
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
  ["leftArmIn", "Bras gauche fléchi (po)", "Left flexed arm (in)", false, 200],
  ["rightArmIn", "Bras droit fléchi (po)", "Right flexed arm (in)", false, 200],
  ["rightThighIn", "Cuisse droite (po)", "Right thigh (in)", false, 200],
  ["leftCalfIn", "Mollet gauche (po)", "Left calf (in)", false, 200],
  ["rightCalfIn", "Mollet droit (po)", "Right calf (in)", false, 200],
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
    valid(measurements.leftArmIn ?? null, 200) && valid(measurements.leftCalfIn ?? null, 200) &&
    valid(measurements.rightCalfIn ?? null, 200) && valid(measurements.rightArmIn, 200) && valid(measurements.rightThighIn, 200) &&
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
  const pendingFocus = useRef<string | null>(null);
  const [focusAttempt, setFocusAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const french = client?.locale !== "en-CA";
  const t = (fr: string, en: string) => french ? fr : en;
  const submitted = assessment?.status === "SUBMITTED";
  const dirty = responses !== null && assessment !== null && JSON.stringify(responses) !== JSON.stringify(assessment.responses);
  const titles = [
    t("Directives", "Instructions"), t("Photos", "Photos"), t("Mesures", "Measurements"),
    t("Charges de départ", "Starting loads"), t("Cardio", "Cardio"),
    t("Mobilité", "Mobility"), t("Relire et envoyer", "Review and send"),
  ];
  const headings = [
    t("Avant de commencer", "Before you start"), t("Photos", "Photos"),
    t("Tes mesures", "Your measurements"), t("Tes charges de départ", "Your starting loads"),
    t("Ton point de départ cardio", "Your cardio starting point"),
    t("Ton corps après la séance", "Your body after training"), t("Relire et envoyer", "Review and send"),
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
          !window.confirm(french ? "Quitter sans enregistrer tes dernières modifications ? Elles ne seront pas conservées." : "Leave without saving your latest changes? They won’t be kept.")) {
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
    const modes = allowedModes(movement, next.variant);
    const mode = next.mode ?? (modes.length === 1 ? modes[0] : null);
    const normalized = next.status === "DONE" && next.variant
      ? { ...next, mode, unit: mode === "BODYWEIGHT" ? null : next.unit ?? "LB" }
      : next;
    if (responses) editSection("loads", { ...responses.loads, [movement]: normalized });
  }
  function goToStep(next: number) {
    setStep(next); setStepsOpen(false); setFocusAttempt((value) => value + 1);
  }
  function goToIssue(path: string) {
    const section = path.split(".")[0];
    pendingFocus.current = path;
    goToStep(({ instructionsAccepted: 0, photos: 1, measurements: 2, loads: 3, cardio: 4, mobility: 5 } as Record<string, number>)[section] ?? 0);
    setFocusAttempt((value) => value + 1);
  }
  useEffect(() => {
    const path = pendingFocus.current;
    const frame = requestAnimationFrame(() => {
      pendingFocus.current = null;
      const target = Array.from(formRef.current?.querySelectorAll<HTMLElement>("[name]") ?? [])
        .find((element) => path !== null && element.getAttribute("name") === path) ?? heading.current;
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, focusAttempt]);

  function readableError(code: string) {
    if (code === "409") return t("Ta semaine zéro a été mise à jour ailleurs ou a déjà été envoyée. Tes réponses restent à l’écran. Ouvre la version enregistrée avant de continuer.", "Your Week Zero was updated elsewhere or has already been sent. Your entries remain on screen. Open the saved version before continuing.");
    if (["400", "413", "415", "422"].includes(code)) return t("Vérifie les valeurs, le format des photos et les champs demandés. Tes réponses restent à l’écran.", "Check the values, photo format and required fields. Your answers remain on screen.");
    if (code === "401" || code === "403") return t("Ta connexion n’est plus active. Reconnecte-toi pour continuer. Seules tes réponses déjà enregistrées sont conservées dans ton portail.", "You’re no longer signed in. Sign in again to continue. Only your previously saved entries are kept in your portal.");
    return t("On n’a pas reçu la confirmation. Tes réponses restent à l’écran. Réessaie la même action pour vérifier l’enregistrement, sans créer de doublon.", "We haven’t received confirmation. Your entries remain on screen. Try the same action again to check the save, without creating a duplicate.");
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
      setError(t("Il reste des éléments à remplir. Pour un exercice ou un test non réalisé, indique-le et explique pourquoi avant l’envoi.", "A few items still need to be filled in. For an exercise or test you did not perform, mark it that way and explain why before sending."));
      return;
    }
    if (send && !window.confirm(t("Envoyer ta semaine zéro à ton coach ? Après l’envoi, tu pourras la consulter, mais tu ne pourras plus modifier tes réponses ni tes photos.", "Send your Week Zero to your coach? After sending, you can view it, but you won’t be able to edit your answers or photos."))) return;
    setBusy(true); setError(null); setSavedNotice(false);
    try {
      let current = await savePending(assessment);
      if (send) {
        const submission = { expectedVersion: current.version };
        current = await requestAcquisition("/api/v1/client/week-zero/acquisition/submit", {
          method: "POST", body: { ...submission, clientMutationId: commandKey(submitCommand, submission) },
        });
        setAssessment(current); setResponses(current.responses); submitCommand.current = null;
        leavingIntentionally.current = true;
        window.location.assign("/client?weekZero=submitted");
        return;
      }
      setSavedNotice(true);
    } catch (caught) { handleRequestError(caught); } finally { setBusy(false); }
  }
  async function uploadPhoto(slot: WeekZeroPhotoSlot, file: File, retry?: PhotoAttempt) {
    if (!assessment || busy || conflict || submitted || (!retry && photoRetry)) return;
    if (!retry && (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 4 * 1024 * 1024)) {
      setError(t("Choisis une photo JPEG, PNG ou WebP de 4 Mo maximum.", "Choose a JPEG, PNG or WebP photo no larger than 4 MB.")); return;
    }
    setBusy(true); setError(null); setSavedNotice(false);
    try {
      // A photo must not validate or discard unrelated in-progress entries.
      // Only create the server draft if no acquisition exists yet.
      let current = assessment;
      if (!retry && current.status === "NOT_STARTED") {
        const draft = { expectedVersion: current.version, responses: current.responses };
        current = await requestAcquisition("/api/v1/client/week-zero/acquisition", {
          method: "PUT", body: { ...draft, clientMutationId: commandKey(saveCommand, draft) },
        });
        setAssessment(current);
        saveCommand.current = null;
      }
      const pending = retry ?? { assetId: crypto.randomUUID(), expectedVersion: current.version, file, key: crypto.randomUUID(), slot };
      const form = new FormData();
      form.set("slot", pending.slot); form.set("assetId", pending.assetId);
      form.set("expectedVersion", String(pending.expectedVersion)); form.set("clientMutationId", pending.key); form.set("file", pending.file);
      setPhotoRetry(pending);
      const response = await fetch("/api/v1/client/week-zero/photos", { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(String(response.status));
      const parsed = weekZeroPhotoUploadResponseSchema.parse(await response.json());
      if (parsed.data.acquisition.responses.photos[pending.slot] !== pending.assetId) throw new Error("502");
      setAssessment(parsed.data.acquisition);
      setResponses((local) => local && ({
        ...local,
        photos: { ...local.photos, [pending.slot]: parsed.data.acquisition.responses.photos[pending.slot] },
      }));
      setPhotoRetry(null); saveCommand.current = null;
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "503";
      if (["400", "413", "415", "422"].includes(code)) setPhotoRetry(null);
      handleRequestError(caught);
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (dirty && !window.confirm(t("Te déconnecter sans enregistrer tes dernières modifications ? Elles ne seront pas conservées.", "Sign out without saving your latest changes? They won’t be kept."))) return;
    setBusy(true);
    const received = await requestClientLogout((destination) => { leavingIntentionally.current = true; window.location.replace(destination); });
    if (!received) { setError(t("Déconnexion impossible. Réessaie.", "Unable to sign out. Try again.")); setBusy(false); }
  }
  const missing = responses ? completionMessages(responses, french) : [];

  return <ClientVisualShell current="week-zero" name={client?.displayName} french={french} documentNavigation
    accountAction={<button className="fe-button" disabled={busy} onClick={() => void signOut()}>{t("Se déconnecter", "Sign out")}</button>}>
    <div className={styles.page} data-week-zero-checkpoint="acquisition-v1">
      <header className={styles.intro}><p className="fe-kicker">{t("Semaine zéro", "Week Zero")}</p><h1 className="fe-title">{t("Ta semaine zéro", "Your Week Zero")}</h1><p>{t("Tes premiers repères pour un programme adapté à toi.", "Your starting point for a program that fits you.")}</p></header>
      {error && <Feedback>{error}</Feedback>}
      {sessionExpired && <Link className="fe-button" href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>}
      {conflict && <button className="fe-button" onClick={() => { if (window.confirm(t("Ouvrir la version enregistrée ? Elle remplacera les réponses actuellement affichées, y compris tes modifications non enregistrées.", "Open the saved version? It will replace the answers currently on screen, including your unsaved changes."))) setAttempt((value) => value + 1); }}>{t("Ouvrir la version enregistrée", "Open saved version")}</button>}
      {photoRetry && !conflict && <button className="fe-button" disabled={busy} onClick={() => void uploadPhoto(photoRetry.slot, photoRetry.file, photoRetry)}>{t("Réessayer l’envoi de la photo", "Retry photo upload")}</button>}
      {failed ? <><Feedback>{t("Impossible de charger ta semaine zéro. Aucune donnée n’a été remplacée.", "Unable to load your Week Zero. No data was replaced.")}</Feedback><button className="fe-button" onClick={() => setAttempt((value) => value + 1)}>{t("Réessayer", "Try again")}</button></> : !assessment || !responses ? <Loading>{t("Chargement de la semaine zéro…", "Loading Week Zero…")}</Loading> : <>
        {!submitted && <><div className={styles.progressPanel}><div><strong>{t("Étapes complètes", "Steps filled in")}</strong><span>{completedCount} {t("sur", "of")} 7</span></div><progress max={7} value={completedCount} aria-label={t("Progression de la semaine zéro", "Week Zero progress")} /><p>{t("Une étape passe au vert quand les renseignements demandés sont complets. Pense aussi à enregistrer ton brouillon avant de quitter.", "A step turns green when the required details are complete. Remember to save your draft before you leave.")}</p></div>
          <nav className={styles.stepNavigation} aria-label={t("Étapes de la semaine zéro", "Week Zero steps")}><div className={styles.mobileSteps}><p>{step + 1} {t("sur", "of")} {titles.length} · {titles[step]}</p><button type="button" className={styles.stepToggle} aria-expanded={stepsOpen} aria-controls="week-zero-steps" onClick={() => setStepsOpen(!stepsOpen)}>{stepsOpen ? t("Masquer les étapes", "Hide steps") : t("Voir les étapes", "View steps")} <span aria-hidden="true">{stepsOpen ? "−" : "+"}</span></button></div>
            <ol id="week-zero-steps" className={styles.steps} data-expanded={stepsOpen}>{titles.map((title, index) => <li key={title} data-testid={`week-zero-step-${index + 1}`} data-complete={completedSteps[index]}><button className={styles.stepButton} type="button" aria-current={step === index ? "step" : undefined} disabled={busy} onClick={() => goToStep(index)}><span className={styles.stepNumber} aria-hidden="true">{completedSteps[index] ? "✓" : index + 1}</span><span><span className="fe-sr-only">{index + 1}. </span>{title}</span></button></li>)}</ol>
          </nav></>}
        <div className={styles.statePanel} data-subtle={!busy && !submitted}><p className={styles.status} role="status" aria-live="polite" data-state={busy ? "saving" : submitted ? "submitted" : dirty ? "dirty" : assessment.status.toLowerCase()}><Icon name={submitted ? "check" : busy ? "clock" : "alert"} /><span>{busy ? t("Enregistrement en cours…", "Saving…") : submitted ? t("Semaine zéro envoyée à ton coach", "Week Zero sent to your coach") : dirty ? t("Modifications non enregistrées", "Unsaved changes") : assessment.status === "DRAFT" ? t("Brouillon enregistré. Pas encore envoyé à ton coach.", "Draft saved. Not yet sent to your coach.") : t("Ta première étape t’attend", "Your first step is ready to start")}{savedNotice && !submitted ? t(". Sauvegarde confirmée.", ". Save confirmed.") : ""}</span></p>{!submitted && step === 1 && <p className={styles.privacy}><Icon name="eye" /><span>{t("Tes photos restent privées. Ton coach pourra consulter ta semaine zéro seulement après ton envoi.", "Your photos stay private. Your coach can review your Week Zero only after you send it.")}</span></p>}</div>
        {submitted ? <><Feedback tone="success">{t("Ta semaine zéro est bien envoyée. Ton coach peut maintenant consulter tes réponses et tes photos pour préparer la suite. Tu peux les relire ici ; elles ne peuvent plus être modifiées.", "Your Week Zero has been sent. Your coach can now review your answers and photos to prepare what comes next. You can read them here; they can no longer be edited.")}</Feedback><AcquisitionReview responses={responses} assessment={assessment} french={french} /><Link className="fe-button" href="/client">{t("Retour à mon accueil", "Back to my home")}</Link></> : <form ref={formRef} noValidate aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void persist(false); }}><fieldset className={styles.panel} disabled={busy || conflict || Boolean(photoRetry)}><legend className="fe-sr-only">{titles[step]}</legend><h2 className="fe-title" ref={heading} tabIndex={-1}>{headings[step]}</h2>
          {step === 0 && <InstructionsStep responses={responses} setResponses={editSection} french={french} />}
          {step === 1 && <PhotosStep responses={responses} uploadPhoto={uploadPhoto} editSection={editSection} french={french} />}
          {step === 2 && <MeasurementsStep responses={responses} editSection={editSection} french={french} />}
          {step === 3 && <CalibrationStep responses={responses} editLoad={editLoad} french={french} />}
          {step === 4 && <CardioStep responses={responses} editSection={editSection} french={french} />}
          {step === 5 && <MobilityStep responses={responses} editSection={editSection} french={french} />}
          {step === 6 && <><CopyParagraphs id="WZ-07-RELIRE" french={french} /><AcquisitionReview responses={responses} assessment={assessment} french={french} />{missing.length > 0 ? <Feedback>{t("Il reste à compléter : ", "Still to fill in: ")}<ul className={styles.missingLinks}>{missing.map((item) => <li key={item.path}><button type="button" onClick={() => goToIssue(item.path)}>{item.label}<span aria-hidden="true"> →</span></button></li>)}</ul></Feedback> : <Feedback tone="info">{weekZeroCopyText("WZ-07-PRET", french)}</Feedback>}<button className="fe-button fe-button-primary fe-button-wide" type="button" disabled={busy || conflict || missing.length > 0} onClick={() => void persist(true)}>{t("Envoyer ma semaine zéro", "Send my Week Zero")}</button></>}
        </fieldset><div className={styles.actions}><button className="fe-button" type="submit" disabled={busy || conflict || Boolean(photoRetry)}>{t("Enregistrer mon brouillon", "Save my draft")}</button>{step > 0 && <button className="fe-button" type="button" disabled={busy} onClick={() => goToStep(step - 1)}>{t("Précédent", "Previous")}</button>}{step < 6 && <button className="fe-button fe-button-primary" type="button" disabled={busy} onClick={() => goToStep(step + 1)}>{t("On continue", "Let’s continue")}</button>}</div></form>}
        {legacy?.status === "SUBMITTED" && <LegacyArchive assessment={legacy} french={french} />}
      </>}
    </div>
  </ClientVisualShell>;
}

function CopyParagraphs({ id, french }: { id: WeekZeroCopyId; french: boolean }) {
  return <>{weekZeroCopyText(id, french).split("\n\n").map((paragraph, index) => <p key={id + index}>{paragraph}</p>)}</>;
}

function InstructionsStep({ responses, setResponses, french }: { responses: WeekZeroAcquisitionResponses; setResponses: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const c = (id: WeekZeroCopyId) => weekZeroCopyText(id, french);
  return <div className={styles.instructions}>
    <CopyParagraphs id="WZ-01-INTRO" french={french} />
    <div className={styles.warning} role="note"><Icon name="alert" /><div>
      <strong>{c("WZ-01-CHARGES-TITRE")}</strong>
      <p>{c("WZ-01-CHARGES-SECURITE")}</p>
    </div></div>
    <div className={styles.warning} role="note"><Icon name="clock" /><div>
      <strong>{c("WZ-01-CARDIO-TITRE")}</strong>
      <p>{c("WZ-01-CARDIO-SECURITE")}</p>
    </div></div>
    <ul>
      <li>{c("WZ-01-RAPPEL-PHOTOS")}</li>
      <li>{c("WZ-01-RAPPEL-CHARGES")}</li>
      <li>{c("WZ-01-RAPPEL-MOBILITE")}</li>
    </ul>
    <label className={styles.acceptance}>
      <input name="instructionsAccepted" type="checkbox" checked={responses.instructionsAccepted} onChange={(event) => setResponses("instructionsAccepted", event.target.checked)} />
      <span>{c("WZ-01-ACCEPTATION")}</span>
    </label>
  </div>;
}

function PhotosStep({ responses, uploadPhoto, editSection, french }: { responses: WeekZeroAcquisitionResponses; uploadPhoto: (slot: WeekZeroPhotoSlot, file: File) => Promise<void>; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  const [dragSlot, setDragSlot] = useState<WeekZeroPhotoSlot | null>(null);
  return <><CopyParagraphs id="WZ-02-PHOTOS" french={french} /><p>{t("Sur ordinateur, tu peux glisser une photo dans son cadre. Sur mobile, touche « Choisir une photo ».", "On a computer, drag a photo into its frame. On mobile, tap “Choose a photo”.")}</p>
    <div className={styles.photoGrid}>{photoFields.map(([slot, fr, en]) => {
      const assetId = responses.photos[slot];
      return <section className={styles.photoCard} key={slot} data-photo-status={assetId ? "uploaded" : "missing"}
        data-dragging={dragSlot === slot}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragSlot(slot); }}
        onDragLeave={() => setDragSlot(null)}
        onDrop={(event) => {
          event.preventDefault(); setDragSlot(null);
          const file = event.dataTransfer.files[0];
          if (file) void uploadPhoto(slot, file);
        }}>
        <h3>{t(fr, en)}</h3>
        {assetId ? <Image unoptimized width={300} height={400} src={`/api/v1/client/week-zero/photos?slot=${slot}&assetId=${assetId}`} alt={t(`Photo ${fr.toLowerCase()} enregistrée`, `Saved ${en.toLowerCase()} photo`)} />
          : <div className={styles.photoPlaceholder}><Icon name="eye" /><span>{t("Glisse ta photo ici ou choisis un fichier.", "Drop your photo here or choose a file.")}</span></div>}
        <label className={styles.fileField}><span>{assetId ? t("Remplacer la photo", "Replace photo") : t("Choisir une photo", "Choose a photo")}</span>
          <input name={`photos.${slot}`} data-testid={`photo-${slot}`} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadPhoto(slot, file); }} />
        </label>
        <small>{assetId ? t("Photo enregistrée en privé", "Saved in private storage") : t("JPEG, PNG ou WebP · 4 Mo max.", "JPEG, PNG or WebP · 4 MB max.")}</small>
      </section>;
    })}</div>
    <label className={`${styles.field} ${styles.wide}`}>{t("Une précision sur tes photos ? (facultatif)", "Anything to add about your photos? (optional)")}<textarea name="photos.notes" maxLength={1000} value={responses.photos.notes ?? ""} onChange={(event) => editSection("photos", { ...responses.photos, notes: event.target.value || null })} /></label>
  </>;
}

const measurementHelp: Record<string, [string, string]> = {
  bodyWeightLb: ["Pèse-toi au réveil, après être allé aux toilettes, avant de manger, sur la même balance et avec une tenue comparable.", "Weigh yourself after waking and using the bathroom, before eating, on the same scale and in similar clothing."],
  waistIn: ["Debout, ventre relâché, place le ruban à l’horizontale au niveau du nombril. Mesure après une expiration normale, sans serrer ni rentrer le ventre.", "Stand with your abdomen relaxed. Keep the tape level at your navel. Measure after a normal exhale without tightening the tape or pulling your stomach in."],
  chestIn: ["Place le ruban à l’horizontale autour de la poitrine, au niveau des mamelons. Garde les bras relâchés et respire normalement, sans comprimer la peau.", "Keep the tape level around your chest at nipple height. Relax your arms and breathe normally without compressing the skin."],
  hipsIn: ["Pieds rapprochés, passe le ruban autour de la partie la plus large des fesses. Garde-le horizontal, au contact sans serrer.", "With your feet close together, wrap the tape around the widest part of your buttocks. Keep it level and snug without tightening."],
  leftArmIn: ["Fléchis et contracte le bras gauche. Mesure le tour au point le plus large du biceps, sans comprimer. Utilise la même position à chaque suivi.", "Flex your left arm. Measure around the widest part of the biceps without compressing it. Use the same position at each follow-up."],
  rightArmIn: ["Fléchis et contracte le bras droit. Mesure le tour au point le plus large du biceps, sans comprimer. Utilise la même position à chaque suivi.", "Flex your right arm. Measure around the widest part of the biceps without compressing it. Use the same position at each follow-up."],
  leftCalfIn: ["Debout, répartis ton poids sur les deux pieds. Mesure le mollet gauche à son point le plus large, ruban horizontal sans serrer.", "Stand with your weight evenly on both feet. Measure your left calf at its widest point, keeping the tape level without tightening."],
  rightCalfIn: ["Debout, répartis ton poids sur les deux pieds. Mesure le mollet droit à son point le plus large, ruban horizontal sans serrer.", "Stand with your weight evenly on both feet. Measure your right calf at its widest point, keeping the tape level without tightening."],
  rightThighIn: ["Debout, jambe relâchée, mesure la cuisse droite à mi-distance entre le pli de l’aine et le haut de la rotule. Reprends ce même repère lors du suivi.", "Stand with your leg relaxed. Measure your right thigh halfway between the groin crease and the top of the kneecap. Use that same landmark at follow-up."],
};

function MeasurementsStep({ responses, editSection, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><div className={styles.measurementLead}><div><strong>{t("Tes mensurations de départ", "Your starting measurements")}</strong><span>{weekZeroCopyText("WZ-03-SOUS-TITRE", french)}</span></div><CopyParagraphs id="WZ-03-MESURES" french={french} /></div>
    <div className={styles.grid}>{measurementFields.map(([key, fr, en, required, max]) => <div className={styles.measurementField} key={key}>
      <label className={styles.field} htmlFor={`measurement-${key}`}><span>{t(fr, en)}{required ? " *" : ""}</span>{!required && <small>{t("Facultatif", "Optional")}</small>}
        <input id={`measurement-${key}`} name={`measurements.${key}`} type="number" inputMode="decimal" min="0.01" max={max} step="any" required={required} value={responses.measurements[key] ?? ""} onChange={(event) => editSection("measurements", { ...responses.measurements, [key]: nullableNumber(event.target.value) })} />
      </label>
      <details className={styles.measurementHelp}><summary aria-label={t(`Comment mesurer : ${fr}`, `How to measure: ${en}`)}><span aria-hidden="true">i</span></summary><p>{t(...measurementHelp[key])}</p></details>
    </div>)}
      <label className={`${styles.field} ${styles.wide}`}>{t("Une précision à ajouter ? (facultatif)", "Anything to add? (optional)")}<textarea name="measurements.other" maxLength={1000} value={responses.measurements.other ?? ""} onChange={(event) => editSection("measurements", { ...responses.measurements, other: event.target.value || null })} /></label>
    </div>
  </>;
}

function selectVariant(entry: WeekZeroLoadEntry, variant: string): WeekZeroLoadEntry {
  const modes = WEEK_ZERO_VARIANT_LOAD_MODES[variant as keyof typeof WEEK_ZERO_VARIANT_LOAD_MODES];
  return { ...entry, variant: variant || null, mode: modes?.[0] ?? null, load: null, unit: modes?.[0] === "BODYWEIGHT" ? null : "LB" };
}

function CalibrationStep({ responses, editLoad, french }: { responses: WeekZeroAcquisitionResponses; editLoad: (movement: WeekZeroMovementKey, next: WeekZeroLoadEntry) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><div className={styles.warning} role="note"><Icon name="alert" /><div>
    <CopyParagraphs id="WZ-04-CHARGES" french={french} />
  </div></div><div className={styles.movementList}>{WEEK_ZERO_MOVEMENT_KEYS.map((movement, index) => {
    const entry = responses.loads[movement];
    const modes = allowedModes(movement, entry.variant);
    const variants = WEEK_ZERO_MOVEMENT_VARIANTS[movement];
    const exerciseName = entry.variant ? t(...variantLabels[entry.variant]) : t(...movementLabels[movement]);
    return <fieldset className={styles.movementCard} data-testid={`calibration-${movement}`} key={movement} data-complete={loadIsComplete(movement, entry)}>
      <legend><span>{String(index + 1).padStart(2, "0")}</span>{exerciseName}</legend>
      <label className={styles.field}>{t("Résultat", "Result")} *<select name={`loads.${movement}.status`} aria-label={t(`Résultat — ${movementLabels[movement][0]}`, `Result — ${movementLabels[movement][1]}`)} value={entry.status} onChange={(event) => {
        const status = event.target.value as WeekZeroLoadEntry["status"];
        const next = { ...emptyLoad(), status, note: entry.note };
        editLoad(movement, status === "DONE" && variants.length === 1 ? selectVariant(next, variants[0]) : status === "NOT_PERFORMED" ? { ...next, reason: entry.reason } : next);
      }}><option value="NOT_STARTED">{t("Choisir", "Choose")}</option><option value="DONE">{t("Réalisé", "Done")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>
      {entry.status === "NOT_PERFORMED" && <label className={`${styles.field} ${styles.wide}`}>{t("Raison", "Reason")} *<textarea name={`loads.${movement}.reason`} maxLength={500} required value={entry.reason ?? ""} onChange={(event) => editLoad(movement, { ...entry, reason: event.target.value || null })} /></label>}
      {entry.status === "DONE" && <div className={styles.calibrationGrid}>
        <label className={styles.field}>{t("Version de l’exercice utilisée", "Exercise version used")} *<select name={`loads.${movement}.variant`} value={entry.variant ?? ""} required onChange={(event) => editLoad(movement, selectVariant(entry, event.target.value))}><option value="">{t("Choisir l’exercice", "Choose exercise")}</option>{variants.map((variant) => <option value={variant} key={variant}>{t(...variantLabels[variant])}</option>)}</select></label>
        {modes.length > 1 && <label className={styles.field}>{t("Type de traction", "Pull-up type")} *<select name={`loads.${movement}.mode`} value={entry.mode ?? ""} required onChange={(event) => {
          const mode = event.target.value as WeekZeroLoadEntry["mode"];
          editLoad(movement, { ...entry, mode, load: null, unit: mode === "BODYWEIGHT" ? null : "LB" });
        }}><option value="">{t("Choisir", "Choose")}</option>{modes.map((mode) => <option value={mode} key={mode}>{mode === "BODYWEIGHT" ? t("Poids du corps", "Bodyweight") : mode === "ASSISTED" ? t("Avec assistance", "Assisted") : t("Avec charge ajoutée", "Added weight")}</option>)}</select></label>}
        <div className={styles.field}><label htmlFor={`load-${movement}`}>{t("Charge", "Load")} *</label>
          <div className={styles.compoundInput}>
            <input id={`load-${movement}`} name={`loads.${movement}.load`} type="number" inputMode="decimal" min={entry.mode === "BODYWEIGHT" ? "0" : "0.001"} max="10000" step="0.001" required readOnly={entry.mode === "BODYWEIGHT"}
              value={entry.mode === "BODYWEIGHT" ? 0 : entry.load ?? ""} onChange={(event) => editLoad(movement, { ...entry, load: nullableNumber(event.target.value), unit: entry.unit ?? "LB" })} />
            <select name={`loads.${movement}.unit`} aria-label={t("Unité *", "Unit *")} value={entry.unit ?? "LB"} disabled={entry.mode === "BODYWEIGHT"} onChange={(event) => editLoad(movement, { ...entry, unit: event.target.value as WeekZeroLoadEntry["unit"] })}><option value="LB">lb</option><option value="KG">kg</option></select>
          </div>
          {entry.mode === "PER_HAND" && <small>{t("Poids d’un seul haltère", "Weight of one dumbbell")}</small>}
          {entry.mode === "BODYWEIGHT" && <small>{t("0 = poids du corps, sans charge ajoutée", "0 = bodyweight, no added load")}</small>}
        </div>
        <label className={styles.field}>{movement === "lunge" ? t("Répétitions par côté", "Repetitions per side") : t("Répétitions", "Repetitions")} *<input name={`loads.${movement}.reps`} type="number" inputMode="numeric" min="1" max="100" step="1" required value={entry.reps ?? ""} onChange={(event) => editLoad(movement, { ...entry, reps: nullableNumber(event.target.value) })} /></label>
        <label className={styles.field}>{t("Réserve (RIR, facultatif)", "Repetitions in reserve (optional)")}<input name={`loads.${movement}.rir`} type="number" inputMode="numeric" min="0" max="10" step="1" value={entry.rir ?? ""} onChange={(event) => editLoad(movement, { ...entry, rir: nullableNumber(event.target.value) })} /></label>
      </div>}
      {entry.status !== "NOT_STARTED" && <label className={`${styles.field} ${styles.wide}`}>{t("Note (facultatif)", "Note (optional)")}<textarea name={`loads.${movement}.note`} maxLength={1000} value={entry.note ?? ""} onChange={(event) => editLoad(movement, { ...entry, note: event.target.value || null })} /></label>}
    </fieldset>;
  })}</div></>;
}

function CardioStep({ responses, editSection, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  const cardio = responses.cardio;
  const [minutes, setMinutes] = useState(cardio.totalSeconds === null ? "" : String(Math.floor(cardio.totalSeconds / 60)));
  const [seconds, setSeconds] = useState(cardio.totalSeconds === null ? "" : String(Number((cardio.totalSeconds % 60).toFixed(1))));
  const setTime = (m: string, s: string) => {
    setMinutes(m); setSeconds(s);
    const validParts = Number.isInteger(Number(m)) && Number(m) >= 0 && Number(s) >= 0 && Number(s) < 60;
    editSection("cardio", { ...cardio, totalSeconds: !validParts || (m === "" && s === "") ? null : Number((Number(m) * 60 + Number(s)).toFixed(1)) });
  };
  const result = cardioIsComplete(cardio) ? calculateConcept2Result(cardio) : null;
  return <><div className={styles.protocol}><span>Concept2</span><strong>2 000 m</strong><div className={styles.protocolCopy}><CopyParagraphs id="WZ-05-CARDIO" french={french} /></div></div>
    <label className={styles.field}>{t("Niveau d’entraînement cardio — ton autoévaluation", "Cardio training level — your self-assessment")}
      <select name="cardio.selfAssessment" value={cardio.selfAssessment ?? ""} onChange={(event) => editSection("cardio", { ...cardio, selfAssessment: (event.target.value || null) as typeof cardio.selfAssessment })}>
        <option value="">{t("Choisir", "Choose")}</option><option value="EXCELLENT">{t("Excellent", "Excellent")}</option><option value="GOOD">{t("Bon", "Good")}</option><option value="POOR">{t("Mauvais", "Poor")}</option><option value="NONE">{t("Nul", "None")}</option>
      </select><small>{t("Ton ressenti aide ton Coach. Il ne modifie pas la formule du VO₂ max.", "Your assessment helps your Coach. It does not change the VO₂ max formula.")}</small>
    </label>
    <label className={styles.field}>{t("Résultat du test", "Test result")} *<select name="cardio.status" value={cardio.status} onChange={(event) => {
      const status = event.target.value as typeof cardio.status;
      if (status !== "DONE") { setMinutes(""); setSeconds(""); }
      editSection("cardio", status === "NOT_STARTED" ? { ...cardio, status, reason: null, age: null, weightKg: null, sex: null, trainingLevel: null, totalSeconds: null } : status === "NOT_PERFORMED" ? { ...cardio, status, age: null, weightKg: null, sex: null, trainingLevel: null, totalSeconds: null } : { ...cardio, status, reason: null });
    }}><option value="NOT_STARTED">{t("Choisir", "Choose")}</option><option value="DONE">{t("Réalisé", "Done")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>
    {cardio.status === "NOT_PERFORMED" && <label className={styles.field}>{t("Raison", "Reason")} *<textarea name="cardio.reason" maxLength={500} required value={cardio.reason ?? ""} onChange={(event) => editSection("cardio", { ...cardio, reason: event.target.value || null })} /></label>}
    {cardio.status === "DONE" && <div className={styles.grid}>
      <label className={styles.field}>{t("Âge lors du test", "Age at test")} *<input name="cardio.age" type="number" min="16" max="100" step="1" required value={cardio.age ?? ""} onChange={(event) => editSection("cardio", { ...cardio, age: nullableNumber(event.target.value) })} /></label>
      <label className={styles.field}>{t("Poids lors du test (kg)", "Weight at test (kg)")} *<input name="cardio.weightKg" type="number" min="31.75" max="317.52" step="0.001" required value={cardio.weightKg ?? ""} onChange={(event) => editSection("cardio", { ...cardio, weightKg: nullableNumber(event.target.value) })} /></label>
      <label className={styles.field}>{t("Sexe utilisé pour le calcul", "Sex used for the calculation")} *<select name="cardio.sex" required value={cardio.sex ?? ""} onChange={(event) => editSection("cardio", { ...cardio, sex: (event.target.value || null) as typeof cardio.sex })}><option value="">{t("Choisir", "Choose")}</option><option value="MALE">{t("Homme", "Male")}</option><option value="FEMALE">{t("Femme", "Female")}</option></select></label>
      <label className={styles.field}>{t("Profil d’entraînement en aviron — pour le calcul", "Rowing training profile — for the calculation")} *<select name="cardio.trainingLevel" required value={cardio.trainingLevel ?? ""} onChange={(event) => editSection("cardio", { ...cardio, trainingLevel: (event.target.value || null) as typeof cardio.trainingLevel })}><option value="">{t("Choisir", "Choose")}</option><option value="HIGHLY_TRAINED">{t("Très entraîné en aviron", "Highly trained in rowing")}</option><option value="NOT_HIGHLY_TRAINED">{t("Pas très entraîné en aviron", "Not highly trained in rowing")}</option></select>
        <small>{t("« Très entraîné » : plusieurs années d’aviron régulier, au moins quatre jours par semaine, avec des séances variées et une progression des résultats.", "“Highly trained”: several years of regular rowing, at least four days per week, with varied sessions and improving results.")}</small>
      </label>
      <fieldset className={`${styles.timeField} ${styles.wide}`}><legend>{t("Temps sur 2 000 m", "2,000 m time")} *</legend><div className={styles.compoundInput}>
        <label>{t("Minutes", "Minutes")}<input name="cardio.totalSeconds" aria-label={t("Temps — minutes", "Time — minutes")} type="number" inputMode="numeric" min="0" max="20" step="1" required value={minutes} onChange={(event) => setTime(event.target.value, seconds)} /></label><span aria-hidden="true">:</span>
        <label>{t("Secondes", "Seconds")}<input aria-label={t("Temps — secondes", "Time — seconds")} type="number" inputMode="decimal" min="0" max="59.9" step="0.1" required value={seconds} onChange={(event) => setTime(minutes, event.target.value)} /></label>
      </div><small>{t("Exemple : 7 minutes et 30 secondes. Inscris le temps total, pas l’allure au 500 m.", "Example: 7 minutes and 30 seconds. Enter the total time, not your 500 m pace.")}</small></fieldset>
    </div>}
    <label className={styles.field}>{t("Comment s’est passé ton test ? (facultatif)", "How did your test go? (optional)")}<textarea name="cardio.notes" maxLength={1000} value={cardio.notes ?? ""} onChange={(event) => editSection("cardio", { ...cardio, notes: event.target.value || null })} /></label>
    <CardioEstimate result={result} french={french} />
  </>;
}

function CardioEstimate({ result, french }: { result: ReturnType<typeof calculateConcept2Result>; french: boolean }) {
  if (!result) return null;
  const t = (fr: string, en: string) => french ? fr : en;
  const descriptions = {
    POOR: ["VO₂ max à développer. Ce point de départ aidera ton Coach à doser la suite, sans chercher à tout rattraper d’un coup.", "VO₂ max to develop. This starting point helps your Coach plan an appropriate progression, one step at a time."],
    FAIR: ["Une base à renforcer. Des séances adaptées et régulières te permettront de suivre ton évolution.", "A base to build on. Consistent, appropriate training gives you a way to track your progress."],
    AVERAGE: ["Tu as une base cardio à faire progresser. Ce résultat devient ton repère pour les prochains tests.", "You have a cardio base to build on. This result is your reference for future tests."],
    GOOD: ["Bon niveau cardio selon le repère Concept2 de ton âge. Tu as une base solide à entretenir.", "Good cardio fitness against the Concept2 reference for your age. You have a solid base to maintain."],
    EXCELLENT: ["Très bon niveau cardio selon le repère Concept2 de ton âge. Un acquis à entretenir avec régularité.", "Excellent cardio fitness against the Concept2 reference for your age. Keep building on it consistently."],
    OUTSIDE_REFERENCE: ["Ce résultat est hors des repères de classement. Vérifie ton temps total, ton poids et ton profil avec ton Coach.", "This result falls outside the classification reference. Check your total time, weight and profile with your Coach."],
    UNAVAILABLE_AGE_REFERENCE: ["L’estimation est disponible, mais cette référence ne permet pas de classement pour ton âge.", "An estimate is available, but this reference does not provide a classification for your age."],
  } as const;
  return <aside className={styles.derived} aria-live="polite" data-testid="cardio-estimate"><h3>{t("Ton VO₂ max estimé", "Your estimated VO₂ max")}</h3>
    <p className={styles.vo2Value}>{result.estimatedVo2MaxMlKgMin === null ? t("Estimation indisponible", "Estimate unavailable") : `${result.estimatedVo2MaxMlKgMin.toFixed(1)} mL/kg/min`}</p>
    <p>{result.classification ? t(descriptions[result.classification][0], descriptions[result.classification][1]) : t("Ces valeurs sortent du domaine de la formule. Vérifie-les avec ton Coach.", "These values fall outside the formula range. Review them with your Coach.")}</p>
    <dl><div><dt>{t("Allure / 500 m", "Pace / 500 m")}</dt><dd>{result.paceSecondsPer500.toFixed(1)} s</dd></div><div><dt>{t("Puissance moyenne", "Average power")}</dt><dd>{result.averageWatts.toFixed(1)} W</dd></div></dl>
    <p>{t("Calculé dans l’application avec la formule Concept2. C’est une estimation, pas une mesure de laboratoire ni une prédiction de longévité. Ce repère ne donne pas un pourcentage de la population.", "Calculated in the app using the Concept2 formula. This is an estimate, not a laboratory measurement or a longevity prediction. This reference does not give a population percentile.")} <a href="https://www.concept2.com/training/vo2max-calculator" target="_blank" rel="noreferrer">{t("Méthode et repères", "Method and references")}</a></p>
  </aside>;
}

function MobilityStep({ responses, editSection, french }: { responses: WeekZeroAcquisitionResponses; editSection: <K extends keyof WeekZeroAcquisitionResponses>(section: K, value: WeekZeroAcquisitionResponses[K]) => void; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <><CopyParagraphs id="WZ-06-MOBILITE" french={french} /><div className={styles.grid}>{painFields.map(([field, fr, en]) => <label className={styles.field} key={field}>{t(fr, en)} *<select name={`mobility.${field}`} value={responses.mobility[field]} onChange={(event) => editSection("mobility", { ...responses.mobility, [field]: event.target.value as WeekZeroAcquisitionResponses["mobility"][typeof field] })}><option value="NOT_ASSESSED">{t("Choisir une réponse", "Choose an answer")}</option><option value="NO">{t("Non", "No")}</option><option value="YES">{t("Oui", "Yes")}</option><option value="NOT_PERFORMED">{t("Non réalisé", "Not performed")}</option></select></label>)}{mobilityFields.map(([field, fr, en]) => <label className={`${styles.field} ${styles.wide}`} key={field}>{t(fr, en)} *<textarea name={`mobility.${field}`} maxLength={1000} required value={responses.mobility[field] ?? ""} onChange={(event) => editSection("mobility", { ...responses.mobility, [field]: event.target.value || null })} /></label>)}</div></>;
}

function completionMessages(responses: WeekZeroAcquisitionResponses, french: boolean) {
  const t = (fr: string, en: string) => french ? fr : en;
  const parsed = completeWeekZeroAcquisitionResponsesSchema.safeParse(responses);
  if (parsed.success) return [];
  const sections: Record<string, string> = {
    instructionsAccepted: t("Confirmer les directives", "Confirm instructions"),
    photos: t("Photos", "Photos"), measurements: t("Mesures", "Measurements"),
    loads: t("Exercices", "Exercises"), cardio: t("Cardio Concept2", "Concept2 cardio"),
    mobility: t("Ton corps après la séance", "Your body after training"),
  };
  const fields: Record<string, string> = {
    ...Object.fromEntries(measurementFields.map(([key, fr, en]) => [key, t(fr, en)])),
    ...Object.fromEntries(photoFields.map(([key, fr, en]) => [key, t(fr, en)])),
    ...Object.fromEntries([...painFields, ...mobilityFields].map(([key, fr, en]) => [key, t(fr, en)])),
    status: t("résultat", "result"), variant: t("exercice choisi", "chosen exercise"),
    load: t("charge", "load"), mode: t("type de charge", "load type"), unit: t("unité", "unit"),
    reps: t("répétitions", "repetitions"), rir: "RIR", reason: t("raison", "reason"),
    age: t("âge", "age"), weightKg: t("poids", "weight"), sex: t("sexe de référence", "reference sex"),
    trainingLevel: t("profil d’aviron", "rowing profile"), totalSeconds: t("temps", "time"),
    notes: t("notes", "notes"), note: t("note", "note"), other: t("précisions", "details"),
  };
  const seen = new Set<string>();
  return parsed.error.issues.flatMap((issue) => {
    const path = issue.path.join(".");
    if (seen.has(path)) return [];
    seen.add(path);
    const [section, key, field] = issue.path.map(String);
    const movement = section === "loads" && key in movementLabels ? t(...movementLabels[key as WeekZeroMovementKey]) : null;
    return [{ path, label: [movement ?? sections[section], fields[field ?? key]].filter(Boolean).join(" — ") }];
  });
}

function AcquisitionReview({ responses, assessment, french }: { responses: WeekZeroAcquisitionResponses; assessment: WeekZeroAcquisitionSnapshot; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  const empty = t("Non renseigné", "Not provided");
  const cardio = responses.cardio;
  const result = cardioIsComplete(cardio) ? calculateConcept2Result(cardio) : null;
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
    <section><h3>{t("Tes charges de départ — 8 mouvements", "Your starting loads — 8 movements")}</h3><dl className={styles.review}>
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
      <div><dt>{t("Données utilisées pour le calcul", "Details used for the calculation")}</dt><dd>{sex} · {trainingLevel}</dd></div>
      <div><dt>{t("Notes cardio", "Cardio notes")}</dt><dd>{cardio.notes || empty}</dd></div>
      {result && <><div><dt>{t("Allure / 500 m", "Pace / 500 m")}</dt><dd>{result.paceSecondsPer500.toFixed(1)} s</dd></div><div><dt>{t("Puissance moyenne", "Average power")}</dt><dd>{result.averageWatts.toFixed(1)} W</dd></div><div><dt>{t("VO₂ max estimé", "Estimated VO₂ max")}</dt><dd>{result.estimatedVo2MaxMlKgMin === null ? t("Résultat hors des limites du calcul", "Result outside the calculation limits") : `${result.estimatedVo2MaxMlKgMin.toFixed(1)} ml/kg/min`}</dd></div></>}
    </dl></section>
    <section><h3>{t("Ton corps après la séance", "Your body after training")}</h3><dl className={styles.review}>
      {painFields.map(([field, fr, en]) => <div key={field}><dt>{t(fr, en)}</dt><dd>{responses.mobility[field] === "NOT_ASSESSED" ? t("Non documenté", "Not documented") : responses.mobility[field] === "NOT_PERFORMED" ? t("Non réalisé", "Not performed") : responses.mobility[field] === "YES" ? t("Oui", "Yes") : t("Non", "No")}</dd></div>)}
      {mobilityFields.map(([field, fr, en]) => <div key={field}><dt>{t(fr, en)}</dt><dd>{responses.mobility[field] || empty}</dd></div>)}
    </dl></section>
    {assessment.submittedAt && <p className={styles.timestamp}>{t("Transmise le", "Submitted on")} {new Intl.DateTimeFormat(french ? "fr-CA" : "en-CA", { dateStyle: "long" }).format(new Date(assessment.submittedAt))}</p>}
  </div>;
}

function LegacyArchive({ assessment, french }: { assessment: InitialAssessmentSnapshot; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en;
  return <details className={styles.archive}><summary><span><strong>{t("Ton ancien bilan", "Your earlier assessment")}</strong><small>{t("À consulter. Ce bilan ne remplace pas ta semaine zéro.", "For viewing. This assessment does not replace your Week Zero.")}</small></span><Icon name="arrow" /></summary><p>{t("Tu peux relire ici tes anciennes réponses, y compris tes disponibilités. Elles restent conservées, mais ne remplissent pas les sept étapes de ta semaine zéro actuelle.", "You can read your earlier answers here, including your availability. They are kept, but do not fill in the seven steps of your current Week Zero.")}</p><LegacyReview responses={assessment.responses} french={french} /></details>;
}

function LegacyReview({ responses, french }: { responses: InitialAssessmentResponses; french: boolean }) {
  const t = (fr: string, en: string) => french ? fr : en; const empty = t("Non renseigné", "Not provided");
  const rows: [string, string][] = [...measurementFields.map(([key, fr, en]): [string, string] => [t(fr, en), String((responses.measurements as Record<string, number | string | null>)[key] ?? empty)]), [t("Autres précisions", "Other details"), responses.measurements.other || empty], ...painFields.map(([key, fr, en]): [string, string] => [t(fr, en), responses.mobility[key] === "NOT_ASSESSED" ? empty : responses.mobility[key] === "YES" ? t("Oui", "Yes") : t("Non", "No")]), ...mobilityFields.map(([key, fr, en]): [string, string] => [t(fr, en), responses.mobility[key] || empty]), [t("Anciennes disponibilités", "Previous availability"), legacyDays.filter(([key]) => responses.availability.days.includes(key)).map(([, fr, en]) => t(fr, en)).join(", ") || empty], [t("Moment de la journée", "Best time of day"), responses.availability.bestTime || empty], [t("Minutes par séance", "Minutes per session"), String(responses.availability.sessionDurationMinutes ?? empty)], [t("Séances par semaine", "Sessions per week"), String(responses.availability.sessionsPerWeek ?? empty)], [t("Contraintes", "Constraints"), responses.availability.constraints || empty]];
  return <dl className={styles.review}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
