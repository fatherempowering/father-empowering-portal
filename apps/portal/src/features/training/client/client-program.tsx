"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import { PublishedExerciseGuidance } from "@/features/training/shared/published-exercise-guidance";
import { publishedExerciseName, repetitionLabel } from "@/lib/training/workout-presentation";
import { programSelectionQuery } from "@/lib/training/program-navigation";
import type { DraftExercise } from "@/lib/contracts/training-drafts";
import {
  publicationResponseSchema,
  type ProgramPublication,
} from "@/lib/contracts/training-publication";
import {
  workoutListSchema,
  workoutSessionResponseSchema,
  type WorkoutList,
  type WorkoutListItem,
} from "@/lib/contracts/training-results";

import styles from "./client-program.module.css";
import { ProgramWeekDays, useProgramSelection } from "./program-week-days";

const REQUEST_TIMEOUT_MS = 8_000;

async function loadResponse<T>(
  url: string,
  signal: AbortSignal,
  parse: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/client-login");
    throw new Error("AUTH");
  }
  if (!response.ok) throw new Error("LOAD");
  return parse((await response.json()).data);
}

function useProgram(page: number, includeHistory = true) {
  const [program, setProgram] = useState<ProgramPublication | null>(null);
  const [history, setHistory] = useState<WorkoutList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      controller?.abort();
      if (timeout) clearTimeout(timeout);
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      setLoading(true);
      setFailed(false);
      try {
        const nextProgram = await loadResponse(
          "/api/v1/client/program",
          request.signal,
          (value) => publicationResponseSchema.parse(value).program,
        );
        const nextHistory = includeHistory
          ? await loadResponse(
              `/api/v1/client/workouts?page=${page}`,
              request.signal,
              (value) => workoutListSchema.parse(value),
            )
          : null;
        if (!active || controller !== request) return;
        setProgram(nextProgram);
        setHistory(nextHistory);
      } catch (caught) {
        if (
          !active ||
          controller !== request ||
          (caught instanceof Error && caught.message === "AUTH")
        ) return;
        setProgram(null);
        setHistory(null);
        setFailed(true);
      } finally {
        if (controller === request && timeout) clearTimeout(timeout);
        if (active && controller === request) setLoading(false);
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [attempt, includeHistory, page]);

  return {
    program,
    history,
    loading,
    failed,
    retry: () => setAttempt((current) => current + 1),
  };
}

export function ClientProgramAction({ french = true }: { french?: boolean }) {
  const { program, loading, failed, retry } = useProgram(0, false);
  const { week, session, choose } = useProgramSelection(program);
  const query = program && week ? programSelectionQuery(program.id, week.number, session?.id).toString() : "";
  return (
    <section className={styles.homeProgram} aria-label={french ? "Ton programme" : "Your program"}>
      {loading ? (
        <Loading>
          {french ? "Vérification de ton programme…" : "Checking your program…"}
        </Loading>
      ) : failed ? (
        <>
          <Feedback>
            {french
              ? "Impossible de vérifier ton programme. Réessaie avec une connexion disponible."
              : "Unable to check your program. Retry when connected."}
          </Feedback>
          <button className="fe-button" type="button" onClick={retry}>
            {french ? "Réessayer le programme" : "Retry program"}
          </button>
        </>
      ) : program ? (
        <>
          <h2>{localized(program.document.title, french)}</h2>
          {week ? <ProgramWeekDays program={program} week={week} session={session} french={french} choose={choose} /> : null}
          {session ? (
            <a className="fe-button fe-button-primary" data-document-navigation="" href={`/client/workout?${query}&language=${french ? "fr" : "en"}`}>
              {french ? "Ouvrir" : "Open"} · {localized(session.title, french)}
            </a>
          ) : null}
          <Link className="fe-button" href={`/client/program?${query}&language=${french ? "fr" : "en"}`}>
            {french ? "Voir mon programme" : "View my program"}
          </Link>
        </>
      ) : (
        <p>
          {french
            ? "Ton programme est en préparation. Il apparaîtra ici lorsque ton coach le publiera; aucune séance à compléter ici pour le moment."
            : "Your program is being prepared. It will appear here when your coach publishes it; there are no sessions to complete here yet."}
        </p>
      )}
    </section>
  );
}

export function ClientProgram() {
  const [historyPage, setHistoryPage] = useState(0);
  const { program, history, loading, failed, retry } = useProgram(historyPage);
  const { week, session, choose } = useProgramSelection(program);
  const [french, setFrench] = useState(true);
  const [logoutError, setLogoutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const status = useSelectedWorkoutStatus(program?.id, week?.number, session?.id);
  useEffect(() => {
    setFrench(new URLSearchParams(window.location.search).get("language") !== "en");
  }, []);

  async function logout() {
    setSigningOut(true);
    setLogoutError(false);
    if (!(await requestClientLogout((url) => window.location.replace(url)))) {
      setSigningOut(false);
      setLogoutError(true);
    }
  }

  return (
    <AppShell
      space="client"
      current="program"
      locale={french ? "fr" : "en"}
      accountAction={
        <button
          className="fe-button"
          type="button"
          disabled={signingOut}
          onClick={() => void logout()}
        >
          {french ? "Se déconnecter" : "Sign out"}
        </button>
      }
    >
      <div className={styles.page}>
        <div className={styles.heading}>
          <div>
            <p className="fe-kicker">{loading || failed
              ? "TRAINING"
              : program
                ? `TRAINING · ${french ? "PROGRAMME DISPONIBLE" : "PROGRAM AVAILABLE"}`
                : french ? "PROGRAMME EN PRÉPARATION" : "PROGRAM IN PREPARATION"}</p>
            <h1 className="fe-title">{french ? "Mon programme." : "My program."}</h1>
          </div>
          <button className="fe-button" type="button" onClick={() => setFrench(!french)}>
            {french ? "English" : "Français"}
          </button>
        </div>

        {logoutError ? (
          <Feedback>{french ? "Déconnexion impossible. Réessaie." : "Unable to sign out. Try again."}</Feedback>
        ) : null}
        {loading ? (
          <Loading>{french ? "Chargement du programme…" : "Loading program…"}</Loading>
        ) : failed ? (
          <>
            <Feedback>
              {french
                ? "Ton programme et ton historique n’ont pas pu être chargés. Rien n’a été remplacé."
                : "Your program and workout history could not be loaded. Nothing was replaced."}
            </Feedback>
            <button className="fe-button" type="button" onClick={retry}>
              {french ? "Réessayer" : "Try again"}
            </button>
          </>
        ) : !program ? (
          <p>
            {french
              ? "Ton coach n’a pas encore publié de programme. Reviens ici après sa publication."
              : "Your coach has not published a program yet. Come back once it is published."}
          </p>
        ) : (
          <>
            <section className={styles.programSummary} aria-labelledby="program-title">
              <p className={styles.eyebrow}>{french ? "PROGRAMME ACTUEL" : "CURRENT PROGRAM"}</p>
              <h2 id="program-title">{localized(program.document.title, french)}</h2>
              <p>
                {french ? "Publication" : "Publication"} {program.revision} · {program.document.weeks.length}{" "}
                {french ? "semaine(s)" : "week(s)"}
              </p>
              <p>
                {french ? "Choisis ta semaine, puis ta séance." : "Choose your week, then your session."}
              </p>
            </section>

            <section className={styles.selector} aria-labelledby="session-selector-title">
              <h2 id="session-selector-title">{french ? "Choisir une séance" : "Choose a session"}</h2>
              {week ? <ProgramWeekDays program={program} week={week} session={session} french={french} choose={choose} /> : null}
            </section>

            {week && session ? (
              <SessionPreview
                french={french}
                program={program}
                weekNumber={week.number}
                session={session}
                status={status}
              />
            ) : (
              <Feedback>
                {french
                  ? "Cette semaine publiée ne contient aucune séance."
                  : "This published week contains no session."}
              </Feedback>
            )}

            <WorkoutHistory
              french={french}
              history={history}
              page={historyPage}
              setPage={setHistoryPage}
            />
          </>
        )}
        {!loading ? (
          <button className="fe-button" type="button" onClick={retry}>
            {french ? "Actualiser le programme" : "Refresh program"}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}

function useSelectedWorkoutStatus(publicationId?: string, weekNumber?: number, sessionId?: string) {
  const query = publicationId && weekNumber && sessionId
    ? programSelectionQuery(publicationId, weekNumber, sessionId).toString() : "";
  const [known, setKnown] = useState<{ query: string; status: WorkoutListItem["status"] | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    let active = true;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      controller?.abort();
      clearTimeout(timer);
      const request = new AbortController();
      controller = request;
      timer = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      try {
        // Never infer "not started" from a paginated history page.
        const response = await loadResponse(`/api/v1/client/workouts/session?${query}`, request.signal, (value) => workoutSessionResponseSchema.parse(value));
        if (response.publication.id.toLowerCase() !== publicationId?.toLowerCase()) throw new Error("MISMATCH");
        if (response.workout && (response.workout.weekNumber !== weekNumber || response.workout.sessionId.toLowerCase() !== sessionId?.toLowerCase())) throw new Error("MISMATCH");
        if (active && controller === request) setKnown({ query, status: response.workout?.status ?? null });
      } catch {
        if (active && controller === request) setKnown({ query, status: null });
      } finally {
        if (controller === request) clearTimeout(timer);
      }
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller?.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [publicationId, query, sessionId, weekNumber]);
  return known?.query === query ? known.status : null;
}

function SessionPreview({
  french,
  program,
  weekNumber,
  session,
  status,
}: {
  french: boolean;
  program: ProgramPublication;
  weekNumber: number;
  session: ProgramPublication["document"]["weeks"][number]["sessions"][number];
  status: WorkoutListItem["status"] | null;
}) {
  const query = new URLSearchParams({
    publicationId: program.id,
    weekNumber: String(weekNumber),
    sessionId: session.id,
  });
  if (!french) query.set("language", "en");
  const action = status
    ? status === "COMPLETED"
      ? french
        ? "Voir le résultat"
        : "View result"
      : french
        ? "Reprendre la séance"
        : "Resume workout"
    : french
      ? "Ouvrir la séance"
      : "Open session";

  return (
    <article className={styles.session} aria-labelledby={`session-${session.id}`}>
      <div className={styles.sessionHeading}>
        <div>
          <p className={styles.eyebrow}>
            {french ? `SEMAINE ${weekNumber}` : `WEEK ${weekNumber}`}
          </p>
          <h2 id={`session-${session.id}`}>{localized(session.title, french)}</h2>
        </div>
        <span className={styles.sessionType}>{sessionType(session.type, french)}</span>
      </div>
      <p>
        {session.required
          ? french
            ? "Séance obligatoire"
            : "Required session"
          : french
            ? "Séance optionnelle"
            : "Optional session"}{" "}
        · {scheduleLabel(session.schedule, french)}
      </p>
      {session.warmup.fr || session.warmup.en ? <p>{localized(session.warmup, french)}</p> : null}
      {session.type === "complete-rest" ? <p>{french ? "Repos complet" : "Complete rest"}</p> : null}
      <div className={styles.sessionAction}>
        <a className="fe-button fe-button-primary" data-document-navigation="" href={`/client/workout?${query.toString()}`}>
          {action}
        </a>
        {status ? <span>{status === "COMPLETED" ? (french ? "Terminée" : "Completed") : (french ? "En cours" : "In progress")}</span> : null}
      </div>
      {session.blocks.length > 0 ? <details className={styles.sessionPlan}>
      <summary>{french ? "Voir le plan de la séance" : "View session plan"}</summary>
      {session.blocks.map((block) => (
        <section className={styles.block} key={block.id}>
          <h3>{localized(block.label, french) || (french ? "Bloc" : "Block")}</h3>
          {block.exercises.map((exercise) => (
            <div className={styles.exercise} key={exercise.id}>
              <h4>{publishedExerciseName(exercise, french)}</h4>
              {exercise.cue.fr || exercise.cue.en ? <p>{localized(exercise.cue, french)}</p> : null}
              <PublishedExerciseGuidance exercise={exercise} french={french} />
              {Array.from({ length: exercise.prescription.sets }, (_, index) => (
                <p key={index}>
                  <strong>{french ? "Série" : "Set"} {index + 1}</strong> ·{" "}
                  <Prescription
                    value={exercise.prescription.prescribedSets?.[index] ?? exercise.prescription}
                    french={french}
                    exercise={exercise}
                  />
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
      </details> : null}
    </article>
  );
}

function WorkoutHistory({
  french,
  history,
  page,
  setPage,
}: {
  french: boolean;
  history: WorkoutList | null;
  page: number;
  setPage(page: number): void;
}) {
  const pageCount = history ? Math.max(1, Math.ceil(history.total / history.pageSize)) : 1;
  return (
    <section className={styles.history} aria-labelledby="workout-history-title" data-workout-history="">
      <div className={styles.historyHeading}>
        <div>
          <p className={styles.eyebrow}>{french ? "TON PARCOURS" : "YOUR JOURNEY"}</p>
          <h2 id="workout-history-title">{french ? "Historique des séances" : "Workout history"}</h2>
        </div>
        {history && history.total > 0 ? (
          <span>{history.total} {french
            ? history.total === 1 ? "séance enregistrée" : "séances enregistrées"
            : history.total === 1 ? "saved workout" : "saved workouts"}</span>
        ) : null}
      </div>
      <p className={styles.historyIntro}>{french
        ? "Chaque séance laisse une trace. Retrouve tes résultats et la prescription suivie."
        : "Every workout leaves a trace. Find your results and the prescription you followed."}</p>
      {!history || history.items.length === 0 ? (
        <p>{french ? "Aucune séance enregistrée pour le moment." : "No workout has been saved yet."}</p>
      ) : (
        <ul className={styles.historyList}>
          {history.items.map((item) => {
            const query = new URLSearchParams({
              publicationId: item.publicationId,
              weekNumber: String(item.weekNumber),
              sessionId: item.sessionId,
            });
            if (!french) query.set("language", "en");
            return (
              <li key={item.id} data-workout-status={item.status}>
                <div className={styles.historyRecord}>
                  <strong id={`history-session-${item.id}`}>{localized(item.session.title, french)}</strong>
                  <span className={styles.historyMeta}>
                    {localized(item.programTitle, french)} · {french ? "Semaine" : "Week"} {item.weekNumber}
                    {" · Publication "}{item.publicationRevision}
                  </span>
                  <span className={styles.historyMeta}>
                    {french ? "Dernier enregistrement : " : "Last saved: "}
                    <time dateTime={item.updatedAt}>{formatDate(item.updatedAt, french)}</time>
                  </span>
                  <span className={styles.historyStatus} data-status={item.status}>
                    <Icon name={item.status === "COMPLETED" ? "check" : "clock"} />
                    {item.status === "COMPLETED"
                      ? french ? "Terminée" : "Completed"
                      : french ? "En cours" : "In progress"}
                  </span>
                </div>
                <a
                  className="fe-button"
                  data-document-navigation=""
                  aria-describedby={`history-session-${item.id}`}
                  href={`/client/workout?${query.toString()}`}
                >
                  {item.status === "COMPLETED"
                    ? french
                      ? "Voir le résultat"
                      : "View result"
                    : french
                      ? "Reprendre"
                      : "Resume"}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {history && history.total > history.pageSize ? (
        <nav className={styles.pagination} aria-label={french ? "Pages de l’historique" : "History pages"}>
          <button className="fe-button" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {french ? "Page précédente" : "Previous page"}
          </button>
          <span>{french ? "Page" : "Page"} {page + 1} / {pageCount}</span>
          <button className="fe-button" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
            {french ? "Page suivante" : "Next page"}
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function localized(value: { fr: string; en: string }, french: boolean) {
  return value[french ? "fr" : "en"] || value.fr || value.en;
}

function sessionType(type: string, french: boolean) {
  const labels: Record<string, [string, string]> = {
    training: ["Entraînement", "Training"],
    "active-recovery": ["Récupération active", "Active recovery"],
    "complete-rest": ["Repos complet", "Complete rest"],
    posing: ["Posing", "Posing"],
    mobility: ["Mobilité", "Mobility"],
  };
  return labels[type]?.[french ? 0 : 1] ?? type;
}

function scheduleLabel(
  schedule: ProgramPublication["document"]["weeks"][number]["sessions"][number]["schedule"],
  french: boolean,
) {
  if (schedule.mode === "flexible") return french ? "Jour flexible" : "Flexible day";
  const days = french
    ? ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return `${schedule.mode === "fixed" ? (french ? "Jour fixe" : "Fixed day") : french ? "Jour suggéré" : "Suggested day"} : ${days[(schedule.day ?? 1) - 1]}`;
}

function formatDate(value: string, french: boolean) {
  return new Intl.DateTimeFormat(french ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Prescription({
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
      {value.reps} {timed ? (french ? "passage(s)" : "round(s)") : repetitionLabel(exercise, french).toLowerCase()} · RIR {value.targetRir} ·{" "}
      {french ? "Repos" : "Rest"} {value.restSeconds} s
      {value.tempo ? ` · Tempo ${value.tempo}` : ""} · {french ? "Charge / cible" : "Load / target"} :{" "}
      {value.loadTarget || "—"}{unit ? ` (${unit})` : ""}
    </>
  );
}
