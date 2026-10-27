"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import { PublishedExerciseGuidance } from "@/features/training/shared/published-exercise-guidance";
import { clearSetMeasurements, completedMeasurementMissing, detailsLabel, detailsPlaceholder, measurementLabel, needsMeasurementDetails, publishedExerciseName, repetitionLabel, stripDerivedSet } from "@/lib/training/workout-presentation";
import type { DraftExercise, DraftSession } from "@/lib/contracts/training-drafts";
import {
  publicationResponseSchema,
  type ProgramPublication,
} from "@/lib/contracts/training-publication";
import {
  saveWorkoutRequestSchema,
  workoutSelectorSchema,
  workoutSessionResponseSchema,
  workoutSnapshotSchema,
  type SaveWorkoutRequest,
  type WorkoutSelector,
  type WorkoutSetInput,
  type WorkoutSetResult,
  type WorkoutSnapshot,
} from "@/lib/contracts/training-results";

import styles from "./client-workout.module.css";
import { buildGuidedUnits, firstPendingGuidedStep, guidedProgress, guidedSetKey, isGuidedStepSaved, restSecondsRemaining, type GuidedUnit } from "./guided-workout";

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_EXTRA_SETS_PER_EXERCISE = 20;
const MAX_WORKOUT_SETS = 24_000;

type EditableSet = WorkoutSetInput & Pick<WorkoutSetResult, "kind" | "unit">;
type Command = {
  fingerprint: string;
  request: SaveWorkoutRequest;
};
type GuideView = "overview" | "run" | "plan" | "exercise-complete" | "review" | "summary" | "records";
type GuidedTransition = { unitKey: string; stepKey: string; restSeconds: number } | "start";

class WorkoutRequestError extends Error {
  constructor(readonly status: number | "NETWORK" | "AUTH") {
    super(String(status));
  }
}

async function request(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      throw new WorkoutRequestError("AUTH");
    }
    return response;
  } catch (caught) {
    if (caught instanceof WorkoutRequestError) throw caught;
    throw new WorkoutRequestError("NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}

export function ClientWorkout() {
  const [selector, setSelector] = useState<WorkoutSelector | null>(null);
  const [invalidSelector, setInvalidSelector] = useState(false);
  const [publication, setPublication] = useState<ProgramPublication | null>(null);
  const [session, setSession] = useState<DraftSession | null>(null);
  const [workout, setWorkout] = useState<WorkoutSnapshot | null>(null);
  const [sets, setSets] = useState<EditableSet[]>([]);
  const [note, setNote] = useState("");
  const [baseline, setBaseline] = useState("");
  const [canStart, setCanStart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [french, setFrench] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [guideView, setGuideView] = useState<GuideView>("overview");
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const [finishedUnitKey, setFinishedUnitKey] = useState<string | null>(null);
  const [restDeadline, setRestDeadline] = useState<number | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const guideRegion = useRef<HTMLDivElement | null>(null);
  const errorRegion = useRef<HTMLDivElement | null>(null);
  const guidanceInteracted = useRef(false);
  const guideReturnView = useRef<GuideView>("overview");
  const guidedTransition = useRef<GuidedTransition | null>(null);
  const command = useRef<Command | null>(null);
  const leavingIntentionally = useRef(false);
  const inFlight = useRef(false);

  const t = useCallback((fr: string, en: string) => (french ? fr : en), [french]);
  const readOnly = workout?.status === "COMPLETED";
  const draftFingerprint = useMemo(
    () => editableFingerprint(sets, note),
    [note, sets],
  );
  const dirty = Boolean(workout && !readOnly && baseline !== draftFingerprint);
  const protectsInput = dirty || uncertain;
  const units = useMemo(() => session ? buildGuidedUnits(session, sets) : [], [session, sets]);
  const savedSets = workout?.sets ?? [];
  const progress = guidedProgress(units, savedSets);
  const nextPending = firstPendingGuidedStep(units, savedSets);
  const selectedUnit = units.find((unit) => unit.steps.some((step) => step.key === activeStepKey)) ?? nextPending?.unit;
  const selectedStep = selectedUnit?.steps.find((step) => step.key === activeStepKey) ?? nextPending?.step;
  const programHref = selector ? `/client/program?${new URLSearchParams({
    publicationId: selector.publicationId, weekNumber: String(selector.weekNumber), sessionId: selector.sessionId,
    language: french ? "fr" : "en",
  })}` : "/client/program";

  // Move attention only when the guided stage changes, never on field edits,
  // locale changes or countdown ticks. The selector resolves after React commits.
  useEffect(() => {
    if (!guidanceInteracted.current) return;
    focusWorkoutElement(guideRegion.current?.querySelector<HTMLElement>("[data-guide-focus]") ?? null);
  }, [guideView, activeStepKey, restDeadline]);

  useEffect(() => {
    if (error) focusWorkoutElement(errorRegion.current);
  }, [error, validationAttempt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFrench(params.get("language") !== "en");
    const parsed = workoutSelectorSchema.safeParse({
      publicationId: params.get("publicationId"),
      weekNumber: params.get("weekNumber"),
      sessionId: params.get("sessionId"),
    });
    if (!parsed.success) {
      setInvalidSelector(true);
      setLoading(false);
      return;
    }
    setSelector(parsed.data);
  }, []);

  useEffect(() => {
    if (!selector) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    setError(null);
    setSuccess(null);
    setConflict(false);
    setUncertain(false);
    command.current = null;
    guidedTransition.current = null;
    setRestDeadline(null);
    setActiveStepKey(null);

    async function load() {
      try {
        const query = new URLSearchParams({
          publicationId: selector!.publicationId,
          weekNumber: String(selector!.weekNumber),
          sessionId: selector!.sessionId,
        });
        const response = await request(`/api/v1/client/workouts/session?${query.toString()}`);
        if (!response.ok) throw new WorkoutRequestError(response.status);
        const loaded = workoutSessionResponseSchema.parse((await response.json()).data);
        const selectedWeek = loaded.publication.document.weeks.find(
          (item) => item.number === selector!.weekNumber,
        );
        const selectedSession = selectedWeek?.sessions.find(
          (item) => item.id.toLowerCase() === selector!.sessionId.toLowerCase(),
        );
        if (!selectedSession) throw new WorkoutRequestError(404);

        let startAllowed = false;
        if (!loaded.workout) {
          const currentResponse = await request("/api/v1/client/program");
          if (!currentResponse.ok) throw new WorkoutRequestError(currentResponse.status);
          const current = publicationResponseSchema.parse((await currentResponse.json()).data).program;
          startAllowed = current?.id === loaded.publication.id;
        }
        if (!active) return;
        const nextSets = loaded.workout
          ? hydrateSets(selectedSession, loaded.workout.sets)
          : prescribedSets(selectedSession);
        const nextNote = loaded.workout?.note ?? "";
        setPublication(loaded.publication);
        setSession(selectedSession);
        setWorkout(loaded.workout);
        setSets(nextSets);
        setNote(nextNote);
        setBaseline(editableFingerprint(nextSets, nextNote));
        setCanStart(startAllowed);
        setGuideView(loaded.workout?.status === "COMPLETED" ? "summary" : "overview");
      } catch (caught) {
        if (!active) return;
        if (caught instanceof WorkoutRequestError && caught.status === "AUTH") {
          leavingIntentionally.current = true;
          window.location.replace("/client-login");
          return;
        }
        setPublication(null);
        setSession(null);
        setWorkout(null);
        setSets([]);
        setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [attempt, selector]);

  useEffect(() => {
    if (!protectsInput) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingIntentionally.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const followLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a[href]");
      if (
        anchor &&
        anchor.getAttribute("target") !== "_blank" &&
        !window.confirm(
          t(
            "Tes résultats non enregistrés seront perdus. Quitter cette page ?",
            "Your unsaved results will be lost. Leave this page?",
          ),
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [protectsInput, t]);

  function updateSet(exerciseId: string, setNumber: number, change: (set: EditableSet) => EditableSet) {
    if (busy || uncertain || conflict || readOnly) return;
    setSets((current) =>
      current.map((item) =>
        item.exerciseId === exerciseId && item.setNumber === setNumber ? change(item) : item,
      ),
    );
    setError(null);
    setSuccess(null);
  }

  function changeSetStatus(item: EditableSet, status: EditableSet["status"]) {
    if (
      status !== "DONE" &&
      (item.reps !== null || item.load !== null || item.rir !== null || Boolean(item.details)) &&
      !window.confirm(
        t(
          "Changer le statut effacera les résultats de cette série. Continuer ?",
          "Changing the status clears this set’s results. Continue?",
        ),
      )
    ) return item;
    return {
      ...item,
      ...(status === "DONE" ? {} : clearSetMeasurements(item)),
      status,
    };
  }

  function addExtra(exercise: DraftSession["blocks"][number]["exercises"][number]) {
    if (busy || uncertain || conflict || readOnly) return;
    const exerciseSets = sets.filter((item) => item.exerciseId === exercise.id);
    const prescribedCount = exercise.prescription.sets;
    const extras = exerciseSets.filter((item) => item.kind === "EXTRA");
    if (extras.length >= MAX_EXTRA_SETS_PER_EXERCISE || sets.length >= MAX_WORKOUT_SETS) return;
    const used = new Set(exerciseSets.map((item) => item.setNumber));
    let setNumber = prescribedCount + 1;
    while (used.has(setNumber) && setNumber <= prescribedCount + MAX_EXTRA_SETS_PER_EXERCISE) {
      setNumber += 1;
    }
    if (setNumber > prescribedCount + MAX_EXTRA_SETS_PER_EXERCISE) return;
    setSets((current) => [
      ...current,
      {
        exerciseId: exercise.id,
        setNumber,
        status: "PENDING",
        reps: null,
        load: null,
        rir: null,
        kind: "EXTRA",
        unit: exercise.prescription.unit,
      },
    ]);
    setError(null);
    setSuccess(null);
  }

  function removeExtra(item: EditableSet) {
    if (item.kind !== "EXTRA" || busy || uncertain || conflict || readOnly) return;
    setSets((current) =>
      current.filter(
        (candidate) =>
          candidate.exerciseId !== item.exerciseId || candidate.setNumber !== item.setNumber,
      ),
    );
    setError(null);
    setSuccess(null);
  }

  function validationMessage(status: SaveWorkoutRequest["status"], candidateSets = sets) {
    if (candidateSets.some((item) => item.status === "SKIPPED") && !note.trim()) {
      return t(
        "Ajoute une note pour expliquer au moins une série ignorée.",
        "Add a note explaining at least one skipped set.",
      );
    }
    const exercises = session?.blocks.flatMap((block) => block.exercises) ?? [];
    const invalidDone = candidateSets.find((item) => {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      return !exercise || completedMeasurementMissing(exercise, item);
    });
    if (invalidDone) {
      if (invalidDone.unit === "configuration") return t(
        `Indique les répétitions et décris la configuration utilisée pour la série ${invalidDone.setNumber}. Aucune résistance en livres n’est déduite.`,
        `Enter reps and describe the setup used for set ${invalidDone.setNumber}. No resistance in pounds is inferred.`,
      );
      if (invalidDone.unit === "distance") {
        const exercise = exercises.find(item => item.id === invalidDone.exerciseId);
        const detail = exercise ? detailsLabel(exercise, invalidDone.unit, french).toLowerCase() : t("le contexte du parcours", "the route context");
        return t(`Indique la distance en mètres et complète « ${detail} » pour la série ${invalidDone.setNumber}.`,
          `Enter the distance in metres and complete “${detail}” for set ${invalidDone.setNumber}.`);
      }
      return invalidDone.unit === "lb" || invalidDone.unit === "kg"
        ? t(
            `Indique les répétitions et la charge pour la série ${invalidDone.setNumber}.`,
            `Enter reps and load for set ${invalidDone.setNumber}.`,
          )
        : t(
            `Indique la valeur réalisée pour la série ${invalidDone.setNumber}.`,
            `Enter the completed value for set ${invalidDone.setNumber}.`,
          );
    }
    const invalidMeasurement = candidateSets.find(
      (item) =>
        item.status === "DONE" &&
        ((item.reps !== null && (!Number.isInteger(item.reps) || item.reps < 0 || item.reps > 10_000)) ||
          (item.unit === "configuration" ? item.load !== null : item.load === null ||
          !Number.isFinite(item.load) || item.load < 0 || item.load > 100_000 || Number(item.load.toFixed(6)) !== item.load) ||
          (item.details != null && item.details.length > 500) ||
          (item.rir !== null && (!Number.isInteger(item.rir) || item.rir < 0 || item.rir > 10))),
    );
    if (invalidMeasurement) {
      return t(
        `Vérifie les valeurs de la série ${invalidMeasurement.setNumber} : répétitions entières, charge de 0 à 100 000 (six décimales maximum) et RIR de 0 à 10.`,
        `Check set ${invalidMeasurement.setNumber}: whole-number reps, load from 0 to 100,000 (up to six decimal places) and RIR from 0 to 10.`,
      );
    }
    if (status === "COMPLETED" && candidateSets.some((item) => item.status === "PENDING")) {
      return t(
        "Marque chaque série prescrite ou ajoutée comme faite ou ignorée avant de terminer.",
        "Mark every prescribed or added set done or skipped before completing the workout.",
      );
    }
    return null;
  }

  function workoutCommand(status: SaveWorkoutRequest["status"], candidateSets = sets) {
    if (!selector) return null;
    const base = {
      publicationId: selector.publicationId,
      weekNumber: selector.weekNumber,
      sessionId: selector.sessionId,
      expectedVersion: workout?.version ?? 0,
      status,
      sets: candidateSets.map(stripDerivedSet),
      note: note.trim() || null,
    };
    const fingerprint = JSON.stringify(base);
    if (!command.current || command.current.fingerprint !== fingerprint) {
      const parsed = saveWorkoutRequestSchema.safeParse({
        ...base,
        clientMutationId: crypto.randomUUID(),
      });
      if (!parsed.success) {
        setError(
          t(
            "Vérifie les résultats saisis avant d’enregistrer.",
            "Check the entered results before saving.",
          ),
        );
        return null;
      }
      command.current = {
        fingerprint,
        request: parsed.data,
      };
    }
    return command.current.request;
  }

  async function persist(status: SaveWorkoutRequest["status"], confirmCompletion = true, candidateSets = sets, transition?: GuidedTransition) {
    if (!selector || !session || inFlight.current || conflict || readOnly) return;
    const invalid = validationMessage(status, candidateSets);
    if (invalid) {
      setError(invalid);
      setValidationAttempt((current) => current + 1);
      return;
    }
    if (
      status === "COMPLETED" &&
      confirmCompletion &&
      !window.confirm(
        t(
          "Terminer cette séance ? Les résultats deviendront définitivement en lecture seule.",
          "Complete this workout? Results will become permanently read-only.",
        ),
      )
    ) return;
    const outgoing = workoutCommand(status, candidateSets);
    if (!outgoing) return;
    if (transition || status === "COMPLETED") guidanceInteracted.current = true;
    if (transition) guidedTransition.current = transition;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await request("/api/v1/client/workouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(outgoing),
      });
      if (response.status === 409) throw new WorkoutRequestError(409);
      if (!response.ok) throw new WorkoutRequestError(response.status);
      const saved = workoutSnapshotSchema.parse((await response.json()).data?.workout);
      if (
        saved.publicationId !== outgoing.publicationId ||
        saved.weekNumber !== outgoing.weekNumber ||
        saved.sessionId.toLowerCase() !== outgoing.sessionId.toLowerCase()
      ) {
        throw new WorkoutRequestError("NETWORK");
      }
      const nextSets = hydrateSets(saved.session, saved.sets);
      const nextNote = saved.note ?? "";
      setWorkout(saved);
      setSession(saved.session);
      setSets(nextSets);
      setNote(nextNote);
      setBaseline(editableFingerprint(nextSets, nextNote));
      setCanStart(false);
      setUncertain(false);
      setConflict(false);
      command.current = null;
      const pendingTransition = guidedTransition.current;
      guidedTransition.current = null;
      if (saved.status === "COMPLETED") {
        setGuideView("summary");
        setRestDeadline(null);
      } else if (pendingTransition) {
        const savedUnits = buildGuidedUnits(saved.session, nextSets);
        const next = firstPendingGuidedStep(savedUnits, saved.sets);
        setActiveStepKey(next?.step.key ?? null);
        if (pendingTransition === "start") {
          setGuideView(next ? "run" : "review");
        } else if (next?.unit.key === pendingTransition.unitKey) {
          setGuideView("run");
          setRestDeadline(pendingTransition.restSeconds > 0 ? Date.now() + pendingTransition.restSeconds * 1000 : null);
        } else {
          setFinishedUnitKey(pendingTransition.unitKey);
          setRestDeadline(null);
          setGuideView("exercise-complete");
        }
      }
      setSuccess(
        saved.status === "COMPLETED"
          ? t(
              "Séance terminée. Tes résultats sont maintenant conservés en lecture seule.",
              "Workout completed. Your results are now saved read-only.",
            )
          : workout
            ? t("Résultats enregistrés.", "Results saved.")
            : t("Séance commencée. Tu peux maintenant saisir tes résultats.", "Workout started. You can now enter your results."),
      );
    } catch (caught) {
      if (caught instanceof WorkoutRequestError && caught.status === "AUTH") {
        leavingIntentionally.current = true;
        window.location.replace("/client-login");
      } else if (caught instanceof WorkoutRequestError && caught.status === 409) {
        setConflict(true);
        setError(
          workout
            ? t(
                "Une version plus récente existe. Tes saisies restent affichées; recharge la version enregistrée avant de continuer.",
                "A newer version exists. Your entries remain visible; reload the saved version before continuing.",
              )
            : t(
                "L’état de cette séance a changé. Recharge-la avant de commencer.",
                "This workout state changed. Reload it before starting.",
              ),
        );
      } else {
        setUncertain(true);
        setError(
          t(
            "L’enregistrement reste à vérifier. Tes saisies sont protégées. Réessaie pour confirmer sans doublon.",
            "The save still needs verification. Your entries are protected. Retry to confirm it without a duplicate.",
          ),
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function resumeGuide() {
    guidanceInteracted.current = true;
    setActiveStepKey(nextPending?.step.key ?? null);
    setGuideView(nextPending ? "run" : "review");
  }

  function openGuidePage(view: "plan" | "records") {
    guidanceInteracted.current = true;
    guideReturnView.current = guideView;
    setGuideView(view);
  }

  function validateGuidedStep() {
    if (!selectedStep || !selectedUnit || busy || uncertain || conflict || readOnly) return;
    const members = new Set(selectedStep.members.map((member) => guidedSetKey({ exerciseId: member.exercise.id, setNumber: member.setNumber })));
    const candidateSets = sets.map((item) => members.has(guidedSetKey(item)) && item.status !== "SKIPPED"
      ? { ...item, status: "DONE" as const } : item);
    const invalid = validationMessage("IN_PROGRESS", candidateSets);
    if (invalid) { setSuccess(null); setError(invalid); setValidationAttempt((current) => current + 1); return; }
    setSets(candidateSets);
    void persist("IN_PROGRESS", false, candidateSets, {
      unitKey: selectedUnit.key, stepKey: selectedStep.key, restSeconds: selectedStep.restSeconds,
    });
  }

  async function logout() {
    if (inFlight.current) return;
    if (
      protectsInput &&
      !window.confirm(
        t(
          "Tes résultats non enregistrés seront perdus. Te déconnecter ?",
          "Your unsaved results will be lost. Sign out?",
        ),
      )
    ) return;
    setSigningOut(true);
    setSignOutError(null);
    const ok = await requestClientLogout((destination) => {
      leavingIntentionally.current = true;
      window.location.replace(destination);
    });
    if (!ok) {
      setSignOutError(t("Déconnexion impossible. Réessaie.", "Unable to sign out. Try again."));
      setSigningOut(false);
    }
  }

  const pendingCommandStatus = command.current?.request.status;

  return (
    <AppShell
      space="client"
      current="program"
      locale={french ? "fr" : "en"}
      documentNavigation
      accountAction={
        <button className="fe-button" type="button" disabled={signingOut || busy} onClick={() => void logout()}>
          {signingOut ? t("Déconnexion…", "Signing out…") : t("Se déconnecter", "Sign out")}
        </button>
      }
    >
      <div className={styles.page} data-workout-results="" ref={guideRegion} data-guided-running={guideView === "run" || undefined}>
        <div className={styles.heading}>
          <div>
            <a className={styles.back} href={programHref}>← {t("Mon programme", "My program")}</a>
            <p className="fe-kicker">TRAINING · {t("RÉSULTATS", "RESULTS")}</p>
            <h1 className="fe-title">{t("Ma séance.", "My workout.")}</h1>
          </div>
          <button className="fe-button" type="button" onClick={() => setFrench(!french)}>
            {french ? "English" : "Français"}
          </button>
        </div>

        {signOutError ? <Feedback>{signOutError}</Feedback> : null}
        {error ? <div ref={errorRegion} tabIndex={-1} className={styles.focusAnchor}><Feedback>{error}</Feedback></div> : null}
        {success ? <Feedback tone="success">{success}</Feedback> : null}
        {invalidSelector ? (
          <>
            <Feedback>
              {t(
                "Le lien de séance est incomplet ou invalide. Retourne au programme pour choisir une séance.",
                "The workout link is incomplete or invalid. Return to the program and choose a session.",
              )}
            </Feedback>
            <a className="fe-button" href="/client/program">{t("Retour au programme", "Back to program")}</a>
          </>
        ) : loading ? (
          <Loading>{t("Chargement de la séance…", "Loading workout…")}</Loading>
        ) : failed || !publication || !session ? (
          <>
            <Feedback>
              {t(
                "Cette séance n’a pas pu être chargée. Aucune saisie locale n’a été remplacée.",
                "This workout could not be loaded. No local entry was replaced.",
              )}
            </Feedback>
            <button className="fe-button" type="button" onClick={() => setAttempt((current) => current + 1)}>
              {t("Réessayer", "Try again")}
            </button>
          </>
        ) : (
          <>
            <WorkoutHeading
              french={french}
              publication={publication}
              selector={selector!}
              session={session}
              workout={workout}
            />

            <div className={styles.guidedProgress}>
              <div><span>{t("Progression enregistrée", "Saved progress")}</span><strong>{progress.resolved} / {progress.total} {t("séries", "sets")}</strong></div>
              <progress aria-label={t("Séries enregistrées", "Saved sets")} max={Math.max(1, progress.total)} value={progress.resolved} />
            </div>

            {guideView === "overview" ? (
              <section className={styles.startPanel} aria-labelledby="start-workout-title">
                <p className={styles.eyebrow}>{t("TA SÉANCE, UN MOUVEMENT À LA FOIS", "YOUR WORKOUT, ONE MOVEMENT AT A TIME")}</p>
                <h2 id="start-workout-title" tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{t("Le plan de ta séance", "Your workout plan")}</h2>
                <GuidedPlanRows units={units.slice(0, 3)} savedSets={savedSets} french={french} />
                {units.length > 3 ? <button type="button" className="fe-button" onClick={() => openGuidePage("plan")}>
                  {t(`Voir tous les exercices (${units.length} étapes)`, `View all exercises (${units.length} stages)`)}
                </button> : null}
                {!units.length ? <p>{t("Aucune série n’est prescrite pour cette séance. Suis les directives de récupération ci-dessus.", "No sets are prescribed for this session. Follow the recovery guidance above.")}</p> : null}
                <p>
                  {workout ? t("Reprends à la première série qui reste à enregistrer. Tes résultats confirmés sont conservés.", "Resume at the first set still to record. Your confirmed results are kept.") : canStart
                    ? t(
                        "Démarre quand tu es prêt. Tu saisis ce que tu réalises, puis tu valides chaque série. Aucun résultat n’est prérempli.",
                        "Start when you are ready. Enter what you actually complete, then validate each set. No result is prefilled.",
                      )
                    : t(
                        "Cette ancienne publication reste consultable, mais aucune nouvelle séance ne peut y être démarrée.",
                        "This older publication remains readable, but no new workout can be started from it.",
                      )}
                </p>
                {conflict ? (
                  <button
                    className="fe-button"
                    type="button"
                    onClick={() => setAttempt((current) => current + 1)}
                  >
                    {t("Recharger l’état de la séance", "Reload workout state")}
                  </button>
                ) : workout ? <button className="fe-button fe-button-primary" type="button" disabled={busy || uncertain} onClick={resumeGuide}>
                  {t("Reprendre ma séance", "Resume workout")}
                </button> : canStart ? (
                  <button
                    className="fe-button fe-button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void persist("IN_PROGRESS", false, sets, "start")}
                  >
                    {busy
                      ? t("Démarrage…", "Starting…")
                      : uncertain
                        ? t("Réessayer le démarrage", "Retry starting")
                        : t("Commencer la séance", "Start workout")}
                  </button>
                ) : null}
              </section>
            ) : null}

            {guideView === "plan" ? <section className={styles.startPanel}>
              <h2 tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{t("Liste des exercices", "Exercise list")}</h2>
              <p>{t("L’ordre et les prescriptions restent ceux de ton coach.", "The order and prescriptions remain those set by your coach.")}</p>
              <GuidedPlanRows units={units} savedSets={savedSets} french={french} />
              <button className="fe-button fe-button-primary" type="button" onClick={() => setGuideView(guideReturnView.current)}>{t("Retour à la séance", "Back to workout")}</button>
            </section> : null}

            {guideView === "run" && selectedUnit && selectedStep ? <section className={styles.guidedRun} aria-labelledby="guided-current-title">
              <div className={styles.guidedRunHeading}>
                <div>
                  <p className={styles.eyebrow}>{localized(selectedUnit.block.label, french) || t("Entraînement en cours", "Workout in progress")}</p>
                  <h2 id="guided-current-title" tabIndex={-1} data-guide-focus={restDeadline === null ? "" : undefined} className={styles.focusAnchor}>{selectedUnit.grouped ? selectedUnit.block.mode.toUpperCase() : publishedExerciseName(selectedUnit.exercises[0], french)}</h2>
                  <p>{t("Étape", "Stage")} {units.indexOf(selectedUnit) + 1} / {units.length} · {selectedStep.extra ? t("Série extra", "Extra set") : selectedUnit.grouped ? t("Tour", "Round") : t("Série", "Set")} {selectedStep.round}{!selectedStep.extra ? ` / ${selectedUnit.steps.filter((step) => !step.extra).length}` : ""}</p>
                </div>
                <button className="fe-button" type="button" onClick={() => openGuidePage("plan")}>{t("Liste des exercices", "Exercise list")}</button>
              </div>
              {restDeadline !== null ? <GuidedRestTimer deadline={restDeadline} french={french} onContinue={() => setRestDeadline(null)} /> : <>
                <div className={styles.mediaSpace} aria-label={t("Repère de mouvement", "Movement reference")}>
                  <span aria-hidden="true">FE</span>
                  <p>{t("Ta technique d’abord.", "Technique comes first.")}</p>
                  <small>{t("Aucun média n’est associé à ce mouvement pour le moment. Les consignes sont ci-dessous.", "No media is attached to this movement yet. Guidance is below.")}</small>
                </div>
                {selectedUnit.grouped ? <p className={styles.groupInstruction}>{t("Effectue les mouvements de ce tour dans l’ordre. Le repos commence seulement après validation du tour.", "Complete this round’s movements in order. Rest starts only after you validate the round.")} {t("Repos entre les tours", "Rest between rounds")} : {selectedUnit.block.restSeconds} s.</p> : null}
                {selectedStep.members.map(({ exercise, setNumber }) => {
                  const item = sets.find((candidate) => guidedSetKey(candidate) === guidedSetKey({ exerciseId: exercise.id, setNumber }));
                  if (!item) return null;
                  const confirmed = savedSets.some((saved) => guidedSetKey(saved) === guidedSetKey(item) && saved.status !== "PENDING");
                  return <article className={styles.guidedMovement} key={exercise.id}>
                    {selectedUnit.grouped ? <h3>{publishedExerciseName(exercise, french)}</h3> : null}
                    {localized(exercise.cue, french) ? <p>{localized(exercise.cue, french)}</p> : null}
                    <PublishedExerciseGuidance exercise={exercise} french={french} />
                    <WorkoutSetRow french={french} exercise={exercise} item={item} guided
                      editable={!busy && !uncertain && !conflict && !confirmed}
                      update={(change) => updateSet(item.exerciseId, item.setNumber, change)}
                      changeStatus={(status) => updateSet(item.exerciseId, item.setNumber, (current) => changeSetStatus(current, status))}
                      remove={() => { removeExtra(item); setActiveStepKey(null); setGuideView("review"); }} />
                    {confirmed ? <p className={styles.confirmedSet}>{t("Cette série est déjà enregistrée. Elle reste conservée pendant ce tour.", "This set is already saved and stays unchanged during this round.")}</p> : null}
                  </article>;
                })}
                <button className={`fe-button fe-button-primary ${styles.validateButton}`} type="button" disabled={busy || uncertain || conflict}
                  onClick={validateGuidedStep}>
                  {busy ? t("Enregistrement…", "Saving…") : selectedUnit.grouped && !selectedStep.extra ? t("Valider le tour", "Validate round") : t("Valider la série", "Validate set")}
                </button>
              </>}
            </section> : null}

            {guideView === "exercise-complete" ? <section className={styles.completePanel}>
              <span className={styles.completeMark} aria-hidden="true">✓</span>
              <p className={styles.eyebrow}>{t("RÉSULTATS ENREGISTRÉS", "RESULTS SAVED")}</p>
              <h2 tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{(() => { const unit = units.find((candidate) => candidate.key === finishedUnitKey); return unit?.grouped ? localized(unit.block.label, french) : unit ? publishedExerciseName(unit.exercises[0], french) : t("Étape terminée", "Stage complete"); })()}</h2>
              <p>{t("Cette étape est enregistrée. Prêt pour la suite ?", "This stage is saved. Ready for the next one?")}</p>
              {nextPending ? <div className={styles.nextMovement}><span>{t("PROCHAINE ÉTAPE", "UP NEXT")}</span><strong>{nextPending.unit.grouped ? localized(nextPending.unit.block.label, french) : publishedExerciseName(nextPending.unit.exercises[0], french)}</strong></div> : <p>{t("Toutes tes séries sont enregistrées. Il reste à terminer la séance.", "All your sets are saved. You can now complete the workout.")}</p>}
              <button className="fe-button fe-button-primary" type="button" disabled={busy || uncertain || conflict} onClick={resumeGuide}>{nextPending ? t("Exercice suivant", "Next exercise") : t("Voir le résumé de ma séance", "Review my workout")}</button>
              <div className={styles.extraActions}>{units.find((unit) => unit.key === finishedUnitKey)?.exercises.map((exercise) => <button className="fe-button" type="button" key={exercise.id}
                disabled={busy || uncertain || conflict || sets.filter((item) => item.exerciseId === exercise.id && item.kind === "EXTRA").length >= MAX_EXTRA_SETS_PER_EXERCISE || sets.length >= MAX_WORKOUT_SETS}
                onClick={() => { addExtra(exercise); setActiveStepKey(null); setGuideView("run"); }}>
                {t("Ajouter une série extra", "Add extra set")} · {publishedExerciseName(exercise, french)}
              </button>)}</div>
            </section> : null}

            {guideView === "review" || guideView === "summary" ? <section className={styles.completePanel}>
              <p className={styles.eyebrow}>{readOnly ? t("ENTRAÎNEMENT TERMINÉ", "WORKOUT COMPLETE") : t("DERNIÈRE ÉTAPE", "ONE LAST STEP")}</p>
              {readOnly ? <span className={styles.completeMark} aria-hidden="true">✓</span> : null}
              <h2 tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{readOnly ? t("Ta séance est conservée.", "Your workout is saved.") : t("Fais le point, puis termine ta séance.", "Review, then finish your workout.")}</h2>
              <div className={styles.summaryStats}><div><strong>{progress.done}</strong><span>{t("séries réalisées", "sets completed")}</span></div><div><strong>{progress.skipped}</strong><span>{t("séries ignorées", "sets skipped")}</span></div><div><strong>{progress.total - progress.resolved}</strong><span>{t("séries restantes", "sets remaining")}</span></div></div>
              <p>{readOnly ? t("Les résultats sont en lecture seule et disponibles pour ton suivi.", "Your results are read-only and available for your follow-up.") : t("Les séries enregistrées ne ferment pas encore la séance. Vérifie ta note, puis confirme la fin ci-dessous.", "Saved sets do not close the workout yet. Review your note, then confirm completion below.")}</p>
              {readOnly && workout?.note ? <div className={styles.summaryNote}><h3>{t("Ta note de séance", "Your workout note")}</h3><p>{workout.note}</p></div> : null}
              {readOnly ? <a className="fe-button fe-button-primary" href={programHref}>{t("Retour à mon programme", "Back to my program")}</a> : nextPending ? <button className="fe-button" type="button" onClick={resumeGuide}>{t("Reprendre les séries restantes", "Resume remaining sets")}</button> : null}
            </section> : null}

            {guideView !== "plan" && guideView !== "records" ? <div className={styles.secondaryActions}>
              <button className="fe-button" type="button" disabled={busy || uncertain || (guideView === "run" && dirty)} onClick={() => openGuidePage("records")}>
                {!workout ? t("Consulter toutes les prescriptions", "View all prescriptions") : readOnly ? t("Consulter mes résultats", "View my results") : t("Revoir/modifier mes résultats", "Review/edit my results")}
              </button>
            </div> : null}

            {guideView === "records" ? <>
              <h2 tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{t("Mes résultats détaillés", "My detailed results")}</h2>
              <button className="fe-button" type="button" disabled={busy || uncertain || dirty} onClick={() => guideReturnView.current === "run" ? resumeGuide() : setGuideView(guideReturnView.current)}>{t("Retour à la séance guidée", "Back to guided workout")}</button>
              {dirty ? <p>{t("Enregistre tes modifications ci-dessous avant de reprendre le guidage.", "Save your changes below before returning to the guided workout.")}</p> : null}
              <WorkoutExercises
              french={french}
              session={session}
              sets={sets}
              editable={Boolean(workout && !readOnly && !busy && !uncertain && !conflict)}
              resultsVisible={Boolean(workout)}
              updateSet={updateSet}
              changeSetStatus={changeSetStatus}
              addExtra={addExtra}
              removeExtra={removeExtra}
            />
            </> : null}

            {workout && ["run", "review", "records", "exercise-complete"].includes(guideView) ? (
              <section className={styles.notePanel} aria-labelledby="workout-note-title">
                <h2 id="workout-note-title">{t("Note de séance", "Workout note")}</h2>
                <label>
                  {t(
                    "Contexte utile pour ton suivi (obligatoire si une série est ignorée)",
                    "Useful context for your follow-up (required when a set is skipped)",
                  )}
                  <textarea
                    maxLength={2_000}
                    value={note}
                    disabled={readOnly || busy || uncertain || conflict}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setError(null);
                      setSuccess(null);
                    }}
                  />
                </label>
                <span>{note.length} / 2000</span>
              </section>
            ) : null}

            {workout && !readOnly ? (
              <section className={styles.actions} aria-label={t("Actions de la séance", "Workout actions")}>
                <p role="status" aria-live="polite">
                  {busy
                    ? t("Enregistrement en cours…", "Saving…")
                    : uncertain
                      ? t("Enregistrement à vérifier — réessaie pour confirmer sans doublon", "Save needs verification — retry to confirm without a duplicate")
                      : conflict
                        ? t("Conflit de version — recharge requise", "Version conflict — reload required")
                        : dirty
                          ? t("Résultats non enregistrés", "Unsaved results")
                          : t(`Brouillon enregistré · version ${workout.version}`, `Draft saved · version ${workout.version}`)}
                </p>
                {conflict ? (
                  <button className="fe-button" type="button" onClick={() => {
                    if (window.confirm(t("Recharger remplacera les saisies affichées. Continuer ?", "Reloading replaces the displayed entries. Continue?"))) {
                      setAttempt((current) => current + 1);
                    }
                  }}>
                    {t("Recharger la version enregistrée", "Reload saved version")}
                  </button>
                ) : uncertain && pendingCommandStatus ? (
                  <button className="fe-button fe-button-primary" type="button" disabled={busy} onClick={() => void persist(pendingCommandStatus, false)}>
                    {t("Réessayer pour confirmer", "Retry to confirm")}
                  </button>
                ) : guideView === "records" || guideView === "review" ? (
                  <div className={styles.actionButtons}>
                    <button className="fe-button" type="button" disabled={busy || !dirty} onClick={() => void persist("IN_PROGRESS", false)}>
                      {t("Enregistrer les résultats", "Save results")}
                    </button>
                    <button className="fe-button fe-button-primary" type="button" disabled={busy} onClick={() => void persist("COMPLETED")}>
                      {t("Terminer la séance", "Complete workout")}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : readOnly && workout ? (
              <Feedback tone="success">
                {t(
                  `Séance terminée le ${formatDate(workout.completedAt!, french)}. Résultats conservés en lecture seule.`,
                  `Workout completed on ${formatDate(workout.completedAt!, french)}. Results are saved read-only.`,
                )}
              </Feedback>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function GuidedPlanRows({ units, savedSets, french }: { units: GuidedUnit[]; savedSets: WorkoutSetResult[]; french: boolean }) {
  return <ol className={styles.planRows}>{units.map((unit, index) => {
    const complete = unit.steps.every((step) => isGuidedStepSaved(step, savedSets));
    return <li key={unit.key}>
      <span className={styles.planNumber} aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
      <div>
        <strong>{unit.grouped ? localized(unit.block.label, french) || unit.block.mode : publishedExerciseName(unit.exercises[0], french)}</strong>
        <p>{unit.grouped ? `${unit.block.mode.toUpperCase()} · ${unit.steps.filter((step) => !step.extra).length} ${french ? "tours" : "rounds"}` : `${unit.exercises[0].prescription.sets} ${french ? "séries" : "sets"}`}{complete ? ` · ${french ? "enregistré" : "saved"}` : ""}</p>
        {unit.grouped ? <ul>{unit.exercises.map((exercise) => <li key={exercise.id}>{publishedExerciseName(exercise, french)} · {exercise.prescription.sets} {french ? "séries" : "sets"}</li>)}</ul> : <p><PrescriptionText exercise={unit.exercises[0]} value={unit.exercises[0].prescription} french={french} /></p>}
      </div>
    </li>;
  })}</ol>;
}

function GuidedRestTimer({ deadline, french, onContinue }: { deadline: number; french: boolean; onContinue(): void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const remaining = restSecondsRemaining(deadline, now);
  return <section className={styles.restTimer} aria-labelledby="rest-timer-title">
    <p className={styles.eyebrow}>{french ? "SÉRIE ENREGISTRÉE" : "SET SAVED"}</p>
    <h3 id="rest-timer-title" tabIndex={-1} data-guide-focus="" className={styles.focusAnchor}>{french ? "Respire. Récupère." : "Breathe. Recover."}</h3>
    <div className={styles.timerDigits} aria-label={french ? `${remaining} secondes de repos restantes` : `${remaining} seconds of rest remaining`}>
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
    </div>
    <p role="status">{remaining === 0 ? french ? "Repos terminé. Continue quand tu es prêt." : "Rest finished. Continue when you are ready." : french ? "Le prochain effort t’attend. Rien ne démarre automatiquement." : "Your next effort is waiting. Nothing starts automatically."}</p>
    <button className="fe-button fe-button-primary" type="button" onClick={onContinue}>{remaining ? french ? "Passer le repos" : "Skip rest" : french ? "Continuer" : "Continue"}</button>
  </section>;
}

function WorkoutHeading({
  french,
  publication,
  selector,
  session,
  workout,
}: {
  french: boolean;
  publication: ProgramPublication;
  selector: WorkoutSelector;
  session: DraftSession;
  workout: WorkoutSnapshot | null;
}) {
  return (
    <header className={styles.workoutHeading}>
      <div>
        <p className={styles.eyebrow}>
          {localized(publication.document.title, french)} · {french ? "Semaine" : "Week"} {selector.weekNumber}
        </p>
        <h2>{localized(session.title, french)}</h2>
        <p>{localized(session.warmup, french)}</p>
      </div>
      <span className={styles.status} data-status={workout?.status ?? "NOT_STARTED"}>
        {!workout
          ? french
            ? "Non commencée"
            : "Not started"
          : workout.status === "COMPLETED"
            ? french
              ? "Terminée"
              : "Completed"
            : french
              ? "En cours"
              : "In progress"}
      </span>
    </header>
  );
}

function WorkoutExercises({
  french,
  session,
  sets,
  editable,
  resultsVisible,
  updateSet,
  changeSetStatus,
  addExtra,
  removeExtra,
}: {
  french: boolean;
  session: DraftSession;
  sets: EditableSet[];
  editable: boolean;
  resultsVisible: boolean;
  updateSet(exerciseId: string, setNumber: number, change: (set: EditableSet) => EditableSet): void;
  changeSetStatus(item: EditableSet, status: EditableSet["status"]): EditableSet;
  addExtra(exercise: DraftSession["blocks"][number]["exercises"][number]): void;
  removeExtra(item: EditableSet): void;
}) {
  const t = (fr: string, en: string) => (french ? fr : en);
  if (session.type === "complete-rest") {
    return (
      <section className={styles.restPanel}>
        <h2>{t("Repos complet", "Complete rest")}</h2>
        <p>{t("Cette séance publiée ne contient aucune série.", "This published session contains no sets.")}</p>
      </section>
    );
  }
  return (
    <div className={styles.blocks}>
      {session.blocks.map((block, blockIndex) => (
        <section className={styles.block} key={block.id} aria-labelledby={`workout-block-${block.id}`}>
          <div className={styles.blockHeading}>
            <div>
              <p className={styles.eyebrow}>{t(`BLOC ${blockIndex + 1}`, `BLOCK ${blockIndex + 1}`)}</p>
              <h2 id={`workout-block-${block.id}`}>{localized(block.label, french) || t("Bloc", "Block")}</h2>
            </div>
            {block.mode !== "standard" ? <span>{block.mode} · {block.restSeconds} s</span> : null}
          </div>
          {block.exercises.map((exercise) => {
            const exerciseSets = sets
              .filter((item) => item.exerciseId === exercise.id)
              .sort((left, right) => left.setNumber - right.setNumber);
            const extraCount = exerciseSets.filter((item) => item.kind === "EXTRA").length;
            return (
              <article className={styles.exercise} key={exercise.id} aria-labelledby={`workout-exercise-${exercise.id}`}>
                <div className={styles.exerciseHeading}>
                  <div>
                    <h3 id={`workout-exercise-${exercise.id}`}>{publishedExerciseName(exercise, french)}</h3>
                    <p>{localized(exercise.cue, french)}</p>
                  </div>
                  <span>{exercise.prescription.sets} {t("série(s) prescrite(s)", "prescribed set(s)")}</span>
                </div>
                <PublishedExerciseGuidance exercise={exercise} french={french} />
                {!resultsVisible ? (
                  <PrescriptionList exercise={exercise} french={french} />
                ) : (
                  <div className={styles.setList}>
                    {exerciseSets.map((item) => (
                      <WorkoutSetRow
                        key={`${item.exerciseId}:${item.setNumber}`}
                        french={french}
                        exercise={exercise}
                        item={item}
                        editable={editable}
                        update={(change) => updateSet(item.exerciseId, item.setNumber, change)}
                        changeStatus={(status) => updateSet(item.exerciseId, item.setNumber, (current) => changeSetStatus(current, status))}
                        remove={() => removeExtra(item)}
                      />
                    ))}
                  </div>
                )}
                {resultsVisible && editable ? (
                  <button
                    className="fe-button"
                    type="button"
                    disabled={extraCount >= MAX_EXTRA_SETS_PER_EXERCISE || sets.length >= MAX_WORKOUT_SETS}
                    onClick={() => addExtra(exercise)}
                  >
                    {t("Ajouter une série extra", "Add extra set")}
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function WorkoutSetRow({
  french,
  exercise,
  item,
  editable,
  update,
  changeStatus,
  remove,
  guided = false,
}: {
  french: boolean;
  exercise: DraftSession["blocks"][number]["exercises"][number];
  item: EditableSet;
  editable: boolean;
  update(change: (set: EditableSet) => EditableSet): void;
  changeStatus(status: EditableSet["status"]): void;
  remove(): void;
  guided?: boolean;
}) {
  const t = (fr: string, en: string) => (french ? fr : en);
  const prescription = item.kind === "PRESCRIBED"
    ? exercise.prescription.prescribedSets?.[item.setNumber - 1] ?? exercise.prescription
    : null;
  const prefix = `${publishedExerciseName(exercise, french)} · ${t("série", "set")} ${item.setNumber}`;
  const resultDisabled = !editable || (guided ? item.status === "SKIPPED" : item.status !== "DONE");
  return (
    <section className={styles.setCard} data-kind={item.kind} aria-label={prefix}>
      <div className={styles.setHeading}>
        <div>
          <h4>{t("Série", "Set")} {item.setNumber}</h4>
          <span>{item.kind === "EXTRA" ? t("Extra", "Extra") : t("Prescrite", "Prescribed")}</span>
        </div>
        {item.kind === "EXTRA" && editable ? (
          <button className="fe-text-button fe-text-danger" type="button" onClick={remove}>
            {t("Retirer", "Remove")}
          </button>
        ) : null}
      </div>
      {prescription ? (
        <p className={styles.prescription} id={`prescription-${item.exerciseId}-${item.setNumber}`}>
          <strong>{t("Prescription", "Prescription")} :</strong>{" "}
          <PrescriptionText value={prescription} french={french} exercise={exercise} />
        </p>
      ) : null}
      {guided ? <div className={styles.guidedSetState}>
        <p>{item.status === "SKIPPED" ? t("Série ignorée : explique pourquoi dans la note de séance avant de valider.", "Skipped set: explain why in the workout note before validating.") : t("Inscris ce que tu viens de réaliser. La cible reste une indication, pas un résultat.", "Enter what you actually completed. The target is guidance, not a result.")}</p>
        {editable ? <button className="fe-text-button" type="button" onClick={() => changeStatus(item.status === "SKIPPED" ? "PENDING" : "SKIPPED")}>
          {item.status === "SKIPPED" ? t("Saisir cette série", "Enter this set") : t("Ignorer cette série", "Skip this set")}
        </button> : null}
      </div> : <label className={styles.statusField}>
        {t("Statut de la série", "Set status")}
        <select value={item.status} disabled={!editable} onChange={(event) => changeStatus(event.target.value as EditableSet["status"])}>
          <option value="PENDING">{t("À faire", "Pending")}</option>
          <option value="DONE">{t("Faite", "Done")}</option>
          <option value="SKIPPED">{t("Ignorée", "Skipped")}</option>
        </select>
      </label>}
      <div className={styles.resultFields}>
        <label>
          {repetitionLabel(exercise, french)} {["lb", "kg", "configuration"].includes(item.unit) ? "*" : `(${t("facultatif", "optional")})`}
          <input
            aria-label={`${repetitionLabel(exercise, french)} · ${prefix}`}
            type="number"
            min={0}
            max={10_000}
            step={1}
            inputMode="numeric"
            value={item.reps ?? ""}
            disabled={resultDisabled}
            onChange={(event) => {
              const reps = numberOrNull(event.currentTarget.valueAsNumber);
              update((current) => ({ ...current, reps }));
            }}
          />
        </label>
        {item.unit !== "configuration" ? <label>
          {measurementLabel(item.unit, french, exercise)} *
          <input
            aria-label={`${measurementLabel(item.unit, french, exercise)} · ${prefix}`}
            type="number"
            min={0}
            max={100_000}
            step="any"
            inputMode="decimal"
            value={item.load ?? ""}
            disabled={resultDisabled}
            onChange={(event) => {
              const load = numberOrNull(event.currentTarget.valueAsNumber);
              update((current) => ({ ...current, load }));
            }}
          />
        </label> : null}
        {needsMeasurementDetails(exercise, item.unit) ? <label>
          {detailsLabel(exercise, item.unit, french)} *
          <input
            aria-label={`${detailsLabel(exercise, item.unit, french)} · ${prefix}`}
            type="text" maxLength={500} value={item.details ?? ""} disabled={resultDisabled}
            placeholder={detailsPlaceholder(exercise, item.unit, french)}
            onChange={(event) => update((current) => ({ ...current, details: event.target.value }))}
          />
        </label> : null}
        <label>
          RIR ({t("facultatif", "optional")})
          <input
            aria-label={`RIR · ${prefix}`}
            type="number"
            min={0}
            max={10}
            step={1}
            inputMode="numeric"
            value={item.rir ?? ""}
            disabled={resultDisabled}
            onChange={(event) => {
              const rir = numberOrNull(event.currentTarget.valueAsNumber);
              update((current) => ({ ...current, rir }));
            }}
          />
        </label>
      </div>
    </section>
  );
}

function PrescriptionList({ exercise, french }: { exercise: DraftExercise; french: boolean }) {
  return (
    <ul className={styles.prescriptionList}>
      {Array.from({ length: exercise.prescription.sets }, (_, index) => (
        <li key={index}>
          <strong>{french ? "Série" : "Set"} {index + 1}</strong>
          <span>
            <PrescriptionText
              value={exercise.prescription.prescribedSets?.[index] ?? exercise.prescription}
              french={french}
              exercise={exercise}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PrescriptionText({
  value,
  french,
  exercise,
}: {
  value: Omit<DraftExercise["prescription"], "sets" | "prescribedSets">;
  french: boolean;
  exercise: DraftExercise;
}) {
  const measure = exercise.pilot?.performance.measure;
  const timed = measure === "duration" || measure === "distance";
  const unit = value.unit === "configuration" ? "" : value.unit === "distance" && exercise.pilot ? "m" : value.unit;
  return (
    <>
      {value.reps} {timed ? (french ? "passage(s)" : "round(s)") : repetitionLabel(exercise, french).toLowerCase()} · {value.loadTarget || "—"} {unit} · RIR {value.targetRir} ·{" "}
      {french ? "repos" : "rest"} {value.restSeconds} s{value.tempo ? ` · ${value.tempo}` : ""}
    </>
  );
}

function prescribedSets(session: DraftSession): EditableSet[] {
  return session.blocks.flatMap((block) =>
    block.exercises.flatMap((exercise) =>
      Array.from({ length: exercise.prescription.sets }, (_, index) => ({
        exerciseId: exercise.id,
        setNumber: index + 1,
        status: "PENDING" as const,
        reps: null,
        load: null,
        rir: null,
        kind: "PRESCRIBED" as const,
        unit: exercise.prescription.prescribedSets?.[index]?.unit ?? exercise.prescription.unit,
      })),
    ),
  );
}

function hydrateSets(session: DraftSession, saved: WorkoutSetResult[]): EditableSet[] {
  const hydrated = prescribedSets(session);
  const positions = new Map(
    hydrated.map((item, index) => [`${item.exerciseId}:${item.setNumber}`, index]),
  );
  for (const item of saved) {
    const position = positions.get(`${item.exerciseId}:${item.setNumber}`);
    if (position === undefined) hydrated.push({ ...item });
    else hydrated[position] = { ...item };
  }
  return hydrated;
}

function editableFingerprint(sets: EditableSet[], note: string) {
  return JSON.stringify({
    // A guided set stays PENDING while the Client enters actual measurements.
    // Serialization intentionally strips those values; editing protection must
    // not, otherwise closing the page before Validate silently loses the input.
    sets: sets.map(({ exerciseId, setNumber, status, reps, load, rir, details }) => ({
      exerciseId, setNumber, status, reps, load, rir, details,
    })),
    note: note.trim() || null,
  });
}

function localized(value: { fr: string; en: string }, french: boolean) {
  return value[french ? "fr" : "en"] || value.fr || value.en;
}

function numberOrNull(value: number) {
  return Number.isFinite(value) ? value : null;
}

function formatDate(value: string, french: boolean) {
  return new Intl.DateTimeFormat(french ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function focusWorkoutElement(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}
