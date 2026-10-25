// Isolated presentation harness. This is never an application route or an auth gate.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CoachDashboard } from "../../src/features/coach/components/coach-dashboard";
import { ClientDashboard } from "../../src/features/client/dashboard/client-dashboard";
import { ClientActivationCard } from "../../src/features/client/activation/client-activation-card";
import { ClientLoginCard } from "../../src/features/client/auth/client-login-card";
import { CoachEmailVerificationCard } from "../../src/features/coach/auth/coach-email-verification-card";
import { ClientOnboarding } from "../../src/features/client/onboarding/client-onboarding";
import { ClientWeekZero } from "../../src/features/client/week-zero/client-week-zero";
import { CoachWeekZeroAcquisition } from "../../src/features/coach/components/coach-week-zero-acquisition";
import { createAcquisitionFixture } from "./week-zero-fixture";
import { PersonalPortalSetup } from "../../src/features/coach/personal-portal/personal-portal-setup";
import { ExerciseLibrary } from "../../src/features/training/coach/exercise-library";
import { ExercisePilot } from "../../src/features/training/coach/exercise-pilot";
import { exercisePilotQuerySchema } from "../../src/lib/contracts/exercise-pilot";
import { selectPilotExerciseRequestSchema, pilotDefaultUnit } from "../../src/lib/contracts/training-pilot";
import { queryPilotCatalog } from "../../src/lib/training/pilot/model";
import { catalogueFixture } from "./catalogue-fixture";
import { buildPilotProgramSnapshots } from "../../src/lib/training/pilot/program-snapshot";
import pilotSource from "../../src/lib/training/pilot/source.json";
import { ProgramBuilder } from "../../src/features/training/coach/program-builder";
import { ClientProgram } from "../../src/features/training/client/client-program";
import { ClientWorkout } from "../../src/features/training/client/client-workout";
import { CoachWorkoutResults } from "../../src/features/training/coach/workout-results";
import { newProgram, newSession, newBlock, addLibraryExercise } from "../../src/lib/training/program-editor";
import type { ProgramPublication, PublishProgramRequest } from "../../src/lib/contracts/training-publication";
import type { ProgramSnapshot, SaveProgramRequest } from "../../src/lib/contracts/training-drafts";
import type { ExerciseSnapshot, SaveExerciseRequest } from "../../src/lib/contracts/training";
import {
  type SaveWorkoutRequest,
  type WorkoutSnapshot,
  type WorkoutWireSnapshot,
} from "../../src/lib/contracts/training-results";
import { EMPTY_INITIAL_ASSESSMENT_RESPONSES } from "../../src/lib/contracts/week-zero";
import { ONBOARDING_QUESTIONS } from "../../src/lib/contracts/onboarding-definition";
import {
  EMPTY_ONBOARDING_RESPONSES,
  type OnboardingResponses,
} from "../../src/lib/contracts/onboarding";
import { AuthShell } from "../../src/components/fe/auth-shell";
import { AppShell } from "../../src/components/fe/app-shell";
import { CodeInput } from "../../src/components/fe/code-input";
import { LandingPage } from "../../src/components/fe/landing/landing-page";
import { PortalAccessProvider } from "../../src/components/fe/portal-access-context";
import "../../src/app/globals.css";

const now = Date.now();
let records = [
  ["Alex", "Martin", "ACTIVE", "ACCEPTED"],
  ["David", "Roy", "INVITED", "PENDING"],
  ["Julien", "Moreau", "INVITED", "SENT"],
  ["Nicolas", "Gagnon", "INVITED", "EXPIRED"],
  ["Samuel", "Bouchard", "INVITED", "REVOKED"],
].map(([firstName, lastName, status, invitationStatus], i) => ({
  id: `client-${i}`,
  firstName,
  lastName,
  displayName: `${firstName} ${lastName}`,
  email: `${firstName.toLowerCase()}@example.test`,
  status,
  locale: "fr",
  timezone: "America/Toronto",
  invitation: {
    id: `invitation-${i}`,
    clientId: `client-${i}`,
    status: invitationStatus,
    email: `${firstName.toLowerCase()}@example.test`,
    expiresAt: new Date(
      now + (invitationStatus === "EXPIRED" ? -86400000 : 604800000),
    ).toISOString(),
    sentAt: new Date(now).toISOString(),
    acceptedAt: null,
  },
}));
const harnessParameters = new URLSearchParams(window.location.search);
// Local presentation only: let the real Client links open the matching screen.
// Fixtures remain in memory and reset on page reload; no hosted data is read.
const clientRouteScreens: Record<string, string> = {
  "/client": "client-v2",
  "/client/program": "client-program",
  "/client/workout": "client-workout",
};
const harnessScreen = harnessParameters.get("screen") ?? clientRouteScreens[window.location.pathname];
let scenario = harnessParameters.get("state") ?? (clientRouteScreens[window.location.pathname] ? "legacy-navigation" : "normal");
let message = "";
let clientRequestAttempts = 0;
let failedSaveMutationId: string | null = null;
let assessmentConflictOccurred = false;
let failedOnboardingMutationId: string | null = null;
let onboardingConflictOccurred = false;
let failedPersonalPortalMutationId: string | null = null;
const personalPortalRequests: unknown[] = [];
Object.assign(window, { __personalPortalRequests: personalPortalRequests });
const onboardingRequests: unknown[] = [];
Object.assign(window, { __onboardingRequests: onboardingRequests });

const assessmentResponses = () =>
  structuredClone(EMPTY_INITIAL_ASSESSMENT_RESPONSES);

function assessmentSnapshot(
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" = "NOT_STARTED",
) {
  const responses = assessmentResponses();
  if (status !== "NOT_STARTED") {
    responses.measurements.bodyWeightLb = status === "DRAFT" ? 207.5 : 198.5;
    responses.measurements.waistIn = status === "DRAFT" ? 39.5 : 37.75;
    responses.measurements.other = "Mesure persistée dans le brouillon.";
  }
  if (status === "SUBMITTED") {
    responses.mobility = {
      painSquat: "NO",
      painHinge: "NO",
      painPush: "NO",
      painPull: "NO",
      painCardio: "NO",
      limitedMovement: "N.A.",
      comfortableMovement: "Marche",
      tightArea: "N.A.",
    };
    responses.availability = {
      days: ["MONDAY", "WEDNESDAY"],
      bestTime: "Matin",
      sessionDurationMinutes: 40,
      sessionsPerWeek: 3,
      constraints: null,
    };
  }
  return {
    kind: "INITIAL_ASSESSMENT",
    schemaVersion: 1,
    status,
    version: status === "NOT_STARTED" ? 0 : status === "DRAFT" ? 2 : 3,
    responses,
    updatedAt: status === "NOT_STARTED" ? null : new Date(now).toISOString(),
    submittedAt: status === "SUBMITTED" ? new Date(now).toISOString() : null,
  };
}

function completeOnboardingResponses() {
  const responses = structuredClone(
    EMPTY_ONBOARDING_RESPONSES,
  ) as OnboardingResponses;
  for (const question of ONBOARDING_QUESTIONS) {
    if (!question.required) continue;
    if (question.type === "multi") {
      responses[question.key] = [question.options?.[0]?.value ?? "OTHER"];
    } else if (question.type === "single") {
      responses[question.key] = question.options?.[0]?.value ?? "OTHER";
    } else if (question.type === "number" || question.type === "scale") {
      responses[question.key] = question.min ?? 1;
    } else if (question.type === "email") {
      responses[question.key] = "alex@example.test";
    } else if (question.type === "tel") {
      responses[question.key] = "+1 514 555 0100";
    } else {
      responses[question.key] = `Réponse ${question.key}`;
    }
  }
  responses.fullName = "Alex Martin";
  responses.whyNow = "Retrouver mon énergie pour ma famille.";
  return responses;
}

function onboardingSnapshot(
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" = "SUBMITTED",
  responseOverride?: OnboardingResponses,
) {
  const responses = responseOverride
    ?? (status === "SUBMITTED"
      ? completeOnboardingResponses()
      : structuredClone(EMPTY_ONBOARDING_RESPONSES) as OnboardingResponses);
  if (status === "DRAFT" && !responseOverride) {
    responses.fullName = "Alex Brouillon";
    responses.email = "alex@example.test";
  }
  return {
    kind: "ONBOARDING_INTAKE",
    schemaVersion: 1,
    status,
    version: status === "NOT_STARTED" ? 0 : status === "DRAFT" ? 2 : 3,
    responses,
    updatedAt: status === "NOT_STARTED" ? null : new Date(now).toISOString(),
    submittedAt: status === "SUBMITTED" ? new Date(now).toISOString() : null,
  };
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
let exerciseRecords: ExerciseSnapshot[] = [];
const exerciseReceipts = new Map<string, ExerciseSnapshot>();
const exerciseRequests: SaveExerciseRequest[] = [];
Object.assign(window, { __exerciseRequests: exerciseRequests });
let exerciseResponseLost = false;
const programRecords = new Map<string, ProgramSnapshot>();
const programReceipts = new Map<string, ProgramSnapshot>();
const programVersionRecords = new Map<string, ProgramSnapshot[]>();
const programRequests: SaveProgramRequest[] = [];
Object.assign(window, { __programRequests: programRequests });
let programResponseLost = false;
const recipientId = "19100000-0000-4000-8000-000000000005";
const workoutPublicationId = "19200000-0000-4000-8000-000000000001";
const previousWorkoutPublicationId = "19200000-0000-4000-8000-000000000002";
const workoutProgramId = "19200000-0000-4000-8000-000000000003";
const workoutSessionId = "19200000-0000-4000-8000-000000000004";
const uppercaseWorkoutSessionId = "19200000-0000-4000-8000-00000000ABCD";
const workoutExerciseId = "19200000-0000-4000-8000-000000000005";
const publicationRequests: PublishProgramRequest[] = [];
const publicationReceipts = new Map<string, ProgramPublication>();
let publication: ProgramPublication | null = null;
let publicationResponseLost = false;
Object.assign(window, { __publicationRequests: publicationRequests });
const workoutPublications = new Map<string, ProgramPublication>();
const workoutRecords = new Map<string, WorkoutSnapshot>();
const workoutReceipts = new Map<string, WorkoutSnapshot>();
const workoutRequests: SaveWorkoutRequest[] = [];
let workoutResponseLost = false;
Object.assign(window, {
  __publicationRequests: publicationRequests,
  __workoutRequests: workoutRequests,
});

function workoutKey(publicationId: string, weekNumber: number, sessionId: string) {
  return `${publicationId}:${weekNumber}:${sessionId.toLowerCase()}`;
}

function makePublication(
  id = workoutPublicationId,
  revision = 2,
  sessionIdentifier = workoutSessionId,
) {
  const document = newProgram();
  document.title = revision === 1
    ? { fr: "Phase fondation", en: "Foundation phase" }
    : { fr: "Phase force", en: "Strength phase" };
  document.weeks[0].objective = { fr: "Construire la force", en: "Build strength" };
  const session = newSession();
  session.id = sessionIdentifier;
  session.title = { fr: "Séance A", en: "Session A" };
  session.warmup = { fr: "Échauffement progressif.", en: "Progressive warm-up." };
  const block = newBlock();
  block.label = { fr: "Poussée", en: "Push" };
  const exercise = addLibraryExercise({
    id: "19200000-0000-4000-8000-000000000006",
    name: "Dumbbell Press",
    equipment: "Dumbbells",
    cue: { fr: "Contrôle la descente.", en: "Control the descent." },
    defaultUnit: "lb",
    archived: false,
    version: 1,
    createdBy: "19200000-0000-4000-8000-000000000007",
    updatedAt: new Date(now).toISOString(),
    canEdit: true,
  });
  exercise.id = workoutExerciseId;
  exercise.prescription.sets = 2;
  exercise.prescription.reps = "8";
  exercise.prescription.targetRir = 2;
  exercise.prescription.loadTarget = "40";
  block.exercises.push(exercise);
  session.blocks.push(block);
  document.weeks[0].sessions.push(session);
  return {
    id,
    clientId: recipientId,
    programId: workoutProgramId,
    draftVersion: revision + 1,
    revision,
    document,
    publishedAt: new Date(now - (2 - revision) * 86_400_000).toISOString(),
  } satisfies ProgramPublication;
}

function makeWorkout(
  source: ProgramPublication,
  status: "IN_PROGRESS" | "COMPLETED",
): WorkoutSnapshot {
  const session = structuredClone(source.document.weeks[0].sessions[0]);
  return {
    id: source.id === previousWorkoutPublicationId
      ? "19300000-0000-4000-8000-000000000002"
      : "19300000-0000-4000-8000-000000000001",
    publicationId: source.id,
    weekNumber: 1,
    sessionId: session.id.toLowerCase(),
    version: status === "COMPLETED" ? 3 : 2,
    status,
    sets: [
      { exerciseId: workoutExerciseId, setNumber: 1, status: "DONE", reps: 8, load: 40, rir: 2, kind: "PRESCRIBED", unit: "lb" },
      status === "COMPLETED"
        ? { exerciseId: workoutExerciseId, setNumber: 2, status: "DONE", reps: 7, load: 40, rir: null, kind: "PRESCRIBED", unit: "lb" }
        : { exerciseId: workoutExerciseId, setNumber: 2, status: "PENDING", reps: null, load: null, rir: null, kind: "PRESCRIBED", unit: "lb" },
    ],
    note: status === "COMPLETED" ? "Bonne séance, progression contrôlée." : null,
    startedAt: new Date(now - 3_600_000).toISOString(),
    updatedAt: new Date(now - 600_000).toISOString(),
    completedAt: status === "COMPLETED" ? new Date(now - 600_000).toISOString() : null,
    session,
    programTitle: source.document.title,
    publicationRevision: source.revision,
  };
}

function compactWorkout(workout: WorkoutSnapshot) {
  return {
    id: workout.id,
    publicationId: workout.publicationId,
    weekNumber: workout.weekNumber,
    sessionId: workout.sessionId,
    version: workout.version,
    status: workout.status,
    startedAt: workout.startedAt,
    updatedAt: workout.updatedAt,
    completedAt: workout.completedAt,
    session: {
      id: workout.session.id,
      title: workout.session.title,
      type: workout.session.type,
    },
    programTitle: workout.programTitle,
    publicationRevision: workout.publicationRevision,
  };
}

function wireWorkout(workout: WorkoutSnapshot): WorkoutWireSnapshot {
  return {
    id: workout.id,
    publicationId: workout.publicationId,
    weekNumber: workout.weekNumber,
    sessionId: workout.sessionId,
    version: workout.version,
    status: workout.status,
    sets: structuredClone(workout.sets),
    note: workout.note,
    startedAt: workout.startedAt,
    updatedAt: workout.updatedAt,
    completedAt: workout.completedAt,
    programTitle: structuredClone(workout.programTitle),
    publicationRevision: workout.publicationRevision,
  };
}

const workoutScreen = harnessScreen;
const needsWorkoutPublication = scenario === "program-published"
  || scenario.startsWith("legacy-")
  || scenario.startsWith("guided-")
  || scenario.startsWith("pilot-program")
  || scenario.startsWith("workout-")
  || scenario.startsWith("coach-workout-")
  || workoutScreen === "client-workout"
  || workoutScreen === "coach-workouts";
if (needsWorkoutPublication) {
  publication = makePublication(
    workoutPublicationId,
    2,
    scenario.startsWith("workout-uppercase-session")
      ? uppercaseWorkoutSessionId
      : workoutSessionId,
  );
  if (scenario.startsWith("legacy-")) {
    const template = structuredClone(publication.document.weeks[0]);
    publication.document.weeks = Array.from({ length: 6 }, (_, weekIndex) => {
      const week = structuredClone(template);
      week.number = weekIndex + 1;
      week.sessions = Array.from({ length: weekIndex === 5 ? 1 : 5 }, (_, index) => {
        const session = structuredClone(template.sessions[0]);
        session.id = index === 0 ? workoutSessionId : `19600000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        if (index > 0) {
          session.blocks[0].id = `19600000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
          session.blocks[0].exercises[0].id = `19600000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`;
        }
        session.title = { fr: ["Haut du corps", "Mobilité", "Jambes", "Marche libre", "Récupération"][index], en: ["Upper body", "Mobility", "Legs", "Free walk", "Recovery"][index] };
        session.schedule = index === 3 ? { mode: "flexible", day: null } : { mode: index === 2 ? "suggested" : "fixed", day: index < 2 ? 1 : index + 1 };
        session.required = index !== 3;
        if (index === 4) { session.type = "complete-rest"; session.blocks = []; }
        return session;
      });
      return week;
    });
    if (scenario === "legacy-history") {
      for (let index = 0; index < 21; index += 1) {
        const old = makePublication(`19700000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, 1);
        workoutPublications.set(old.id, old);
        const record = makeWorkout(old, "COMPLETED");
        record.id = `19800000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
      }
      const current = makeWorkout(publication, "IN_PROGRESS");
      workoutRecords.set(workoutKey(current.publicationId, current.weekNumber, current.sessionId), current);
    }
  }
  if (scenario.startsWith("guided-")) {
    const session = publication.document.weeks[0].sessions[0];
    const standard = session.blocks[0];
    standard.exercises[0].prescription.restSeconds = 1;
    const superset = structuredClone(standard);
    superset.id = "19600000-0000-4000-8000-000000000101";
    superset.mode = "superset";
    superset.label = { fr: "Duo tirage", en: "Pull duo" };
    superset.restSeconds = 0;
    superset.exercises = ["Cable Row", "Band Pull-apart"].map((name, index) => {
      const exercise = structuredClone(standard.exercises[0]);
      exercise.id = `19600000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`;
      exercise.name = name;
      exercise.prescription.sets = 1;
      exercise.prescription.restSeconds = 30;
      return exercise;
    });
    session.blocks.push(superset);
    if (scenario === "guided-partial") {
      const record = makeWorkout(publication, "IN_PROGRESS");
      record.sets[1] = { ...record.sets[0], setNumber: 2 };
      record.sets.push(...superset.exercises.map((exercise, index) => ({
        exerciseId: exercise.id, setNumber: 1, status: index === 0 ? "DONE" as const : "PENDING" as const,
        reps: index === 0 ? 8 : null, load: index === 0 ? 30 : null, rir: null, kind: "PRESCRIBED" as const, unit: "lb" as const,
      })));
      workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
    }
  }
  if (scenario.startsWith("pilot-program")) {
    const pilotBlock = publication.document.weeks[0].sessions[0].blocks[0];
    pilotBlock.exercises = buildPilotProgramSnapshots(pilotSource).map((pilot, index) => {
      const item = addLibraryExercise({
        id: `19400000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: pilot.name.en, equipment: pilot.equipment.labels.fr, cue: { fr: "", en: "" }, defaultUnit: pilotDefaultUnit(pilot),
        archived: false, version: 1, createdBy: "19000000-0000-4000-8000-000000000001", updatedAt: new Date(now).toISOString(), canEdit: false, pilot,
      });
      item.id = `19500000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      item.prescription.sets = 2;
      item.prescription.loadTarget = item.prescription.unit === "configuration" ? "Réglage de test décrit par le coach" : item.prescription.unit === "sec" ? "30" : item.prescription.unit === "distance" ? "20" : "25";
      return item;
    });
    if (scenario === "pilot-program-completed") {
      const record = makeWorkout(publication, "COMPLETED");
      record.sets = pilotBlock.exercises.flatMap((item) => Array.from({ length: item.prescription.sets }, (_, index) => ({
        exerciseId: item.id, setNumber: index + 1, status: "DONE" as const,
        reps: item.pilot?.performance.measure === "repetitions" ? 8 : null,
        load: item.prescription.unit === "configuration" ? null : item.prescription.unit === "sec" ? 30 : item.prescription.unit === "distance" ? 20 : 25,
        rir: null, kind: "PRESCRIBED" as const, unit: item.prescription.unit,
        ...(["configuration", "distance"].includes(item.prescription.unit) ? { details: item.prescription.unit === "distance" ? "25 lb par haltère" : "Configuration réellement utilisée, test" } : {}),
      })));
      workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
    }
  }
  workoutPublications.set(publication.id, publication);
  if (["workout-in-progress", "workout-response-lost", "workout-conflict", "workout-dirty", "workout-uppercase-session", "coach-workout-pending"].includes(scenario)) {
    const record = makeWorkout(publication, "IN_PROGRESS");
    workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
  }
  if (["workout-completed", "coach-workout-completed"].includes(scenario)) {
    const record = makeWorkout(publication, "COMPLETED");
    workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
  }
  if (scenario === "workout-history" || scenario === "coach-workout-history") {
    const previous = makePublication(previousWorkoutPublicationId, 1);
    workoutPublications.set(previous.id, previous);
    const record = makeWorkout(previous, "COMPLETED");
    workoutRecords.set(workoutKey(record.publicationId, record.weekNumber, record.sessionId), record);
  }
}
if (harnessParameters.get("screen") === "program-builder") {
  exerciseRecords.push({ id: "19000000-0000-4000-8000-000000000010", name: "Dumbbell Press", equipment: "Dumbbells", cue: { fr: "Contrôle", en: "Control" }, defaultUnit: "lb", archived: false, version: 1, createdBy: "19000000-0000-4000-8000-000000000001", updatedAt: new Date(now).toISOString(), canEdit: true });
}
let pilotAttempts = 0;
let pilotSelectionLost = false;
const pilotSelectionRequests: unknown[] = [];
const pilotSelections = new Map<string, ExerciseSnapshot>();
Object.assign(window, { __pilotSelectionRequests: pilotSelectionRequests });
let handleAcquisition = createAcquisitionFixture();
window.fetch = async (url, init) => {
  const acquisitionReply = await handleAcquisition(String(url), init, scenario);
  if (acquisitionReply) return acquisitionReply;
  const path = String(url);
  const pilotPath = new URL(path, window.location.origin);
  if (pilotPath.pathname === "/api/v1/coach/exercise-pilot") {
    pilotAttempts++;
    if (scenario === "pilot-load-error" || (scenario === "pilot-response-recovery" && pilotAttempts === 1)) return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (scenario === "pilot-malformed") return reply({ data: { items: [] } });
    if (scenario === "pilot-unauthenticated") return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
    if (scenario === "pilot-forbidden") return reply({ error: { code: "FORBIDDEN" } }, 403);
    const query = exercisePilotQuerySchema.parse(Object.fromEntries(pilotPath.searchParams));
    if (scenario === "catalogue-pagination") return reply({ data: catalogueFixture(query) });
    return reply({ data: queryPilotCatalog(pilotSource, query) });
  }
  if (pilotPath.pathname === "/api/v1/coach/exercise-pilot/select") {
    const input = selectPilotExerciseRequestSchema.parse(JSON.parse(String(init?.body)));
    pilotSelectionRequests.push(input);
    if (scenario === "pilot-select-disabled") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    const pilot = buildPilotProgramSnapshots(pilotSource).find((item) => item.sourceId === input.sourceId && item.sourceVersion === input.sourceVersion);
    if (!pilot) return reply({ error: { code: "NOT_FOUND" } }, 404);
    const key = `${pilot.sourceId}@${pilot.sourceVersion}`;
    let exercise = pilotSelections.get(key);
    if (!exercise) {
      exercise = { id: crypto.randomUUID(), name: pilot.name.en, equipment: pilot.equipment.labels.fr,
        cue: { fr: "", en: "" }, defaultUnit: pilotDefaultUnit(pilot), archived: false, version: 1,
        createdBy: "19000000-0000-4000-8000-000000000001", updatedAt: new Date(now).toISOString(), canEdit: false, pilot };
      pilotSelections.set(key, exercise); exerciseRecords.push(exercise);
    }
    if (scenario === "pilot-select-response-lost" && !pilotSelectionLost) { pilotSelectionLost = true; throw new TypeError("Synthetic lost selection confirmation"); }
    if (scenario === "pilot-select-mismatch") return reply({ data: { exercise: { ...exercise, pilot: { ...pilot, sourceId: input.sourceId === "DB_001" ? "DB_034" : "DB_001" } } } });
    return reply({ data: { exercise } });
  }
  const parsedPath = new URL(path, window.location.origin);
  if (path === "/api/v1/auth/client-logout" && ["client-logout-network-error", "onboarding-load-logout-error"].includes(scenario)) throw new TypeError("Synthetic network failure");
  if (path === "/api/v1/client/onboarding" && scenario === "onboarding-load-logout-error") {
    return new Promise<Response>((resolve) => Object.assign(window, {
      __releaseOnboardingLoad: () => resolve(reply({ data: { intake: onboardingSnapshot("NOT_STARTED") } })),
    }));
  }
  if (parsedPath.pathname === "/api/v1/client/workouts/session") {
    if (scenario === "workout-load-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (scenario === "workout-auth-error") return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
    const publicationId = parsedPath.searchParams.get("publicationId") ?? "";
    const weekNumber = Number(parsedPath.searchParams.get("weekNumber"));
    const sessionId = parsedPath.searchParams.get("sessionId") ?? "";
    const selectedPublication = workoutPublications.get(publicationId);
    if (!selectedPublication) return reply({ error: { code: "NOT_FOUND" } }, 404);
    const selectedWorkout = workoutRecords.get(workoutKey(publicationId, weekNumber, sessionId));
    const fixture = {
      workout: selectedWorkout ? wireWorkout(selectedWorkout) : null,
      publication: selectedPublication,
    };
    return reply({ data: fixture });
  }
  if (parsedPath.pathname === "/api/v1/client/workouts" && init?.method === "POST") {
    const input = JSON.parse(String(init.body)) as SaveWorkoutRequest;
    workoutRequests.push(input);
    if (scenario === "workout-conflict" || scenario === "workout-start-conflict") {
      return reply({ error: { code: "VERSION_CONFLICT" } }, 409);
    }
    let saved = workoutReceipts.get(input.clientMutationId);
    if (!saved) {
      const selectedPublication = workoutPublications.get(input.publicationId);
      const selectedSession = selectedPublication?.document.weeks
        .find((week) => week.number === input.weekNumber)?.sessions
        .find((session) => session.id.toLowerCase() === input.sessionId.toLowerCase());
      if (!selectedPublication || !selectedSession) return reply({ error: { code: "NOT_FOUND" } }, 404);
      const previous = workoutRecords.get(workoutKey(input.publicationId, input.weekNumber, input.sessionId));
      const exercises = selectedSession.blocks.flatMap((block) => block.exercises);
      saved = {
        id: previous?.id ?? "19300000-0000-4000-8000-000000000001",
        publicationId: input.publicationId,
        weekNumber: input.weekNumber,
        sessionId: input.sessionId.toLowerCase(),
        version: input.expectedVersion + 1,
        status: input.status,
        sets: input.sets.map((set) => {
          const exercise = exercises.find((candidate) => candidate.id === set.exerciseId)!;
          return {
            ...set,
            kind: set.setNumber <= exercise.prescription.sets ? "PRESCRIBED" as const : "EXTRA" as const,
            unit: exercise.prescription.prescribedSets?.[set.setNumber - 1]?.unit ?? exercise.prescription.unit,
          };
        }),
        note: input.note,
        startedAt: previous?.startedAt ?? new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        completedAt: input.status === "COMPLETED" ? new Date(now).toISOString() : null,
        session: structuredClone(selectedSession),
        programTitle: selectedPublication.document.title,
        publicationRevision: selectedPublication.revision,
      };
      workoutReceipts.set(input.clientMutationId, saved);
      workoutRecords.set(workoutKey(input.publicationId, input.weekNumber, input.sessionId), saved);
    }
    if ((scenario === "workout-response-lost" || (scenario === "guided-response-lost" && workoutRequests.length === 2)) && !workoutResponseLost) {
      workoutResponseLost = true;
      throw new TypeError("Workout confirmation lost after commit");
    }
    return reply({ data: { workout: saved } });
  }
  if (parsedPath.pathname === "/api/v1/client/workouts") {
    const page = Number(parsedPath.searchParams.get("page") ?? 0);
    const items = [...workoutRecords.values()].map(compactWorkout);
    return reply({ data: { items: items.slice(page * 20, page * 20 + 20), total: items.length, page, pageSize: 20 } });
  }
  if (/^\/api\/v1\/coach\/clients\/[^/]+\/workouts\/session$/.test(parsedPath.pathname)) {
    if (scenario === "coach-workout-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (scenario === "coach-workout-forbidden") return reply({ error: { code: "FORBIDDEN" } }, 403);
    const publicationId = parsedPath.searchParams.get("publicationId") ?? "";
    const weekNumber = Number(parsedPath.searchParams.get("weekNumber"));
    const sessionId = parsedPath.searchParams.get("sessionId") ?? "";
    const selectedPublication = workoutPublications.get(publicationId);
    const selectedWorkout = workoutRecords.get(workoutKey(publicationId, weekNumber, sessionId));
    if (!selectedPublication || !selectedWorkout) return reply({ error: { code: "NOT_FOUND" } }, 404);
    return reply({ data: { workout: wireWorkout(selectedWorkout), publication: selectedPublication } });
  }
  if (/^\/api\/v1\/coach\/clients\/[^/]+\/workouts$/.test(parsedPath.pathname)) {
    if (scenario === "coach-workout-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (scenario === "coach-workout-forbidden") return reply({ error: { code: "NOT_FOUND" } }, 404);
    const page = Number(parsedPath.searchParams.get("page") ?? 0);
    const items = [...workoutRecords.values()].map(compactWorkout);
    return reply({ data: { items: items.slice(page * 20, page * 20 + 20), total: items.length, page, pageSize: 20 } });
  }
  if (path.startsWith("/api/v1/coach/programs/recipients")) {
    const clients = scenario === "same-name-clients"
      ? [{id:"19100000-0000-4000-8000-000000000006",name:"Maxime Bourdon",isOwnProfile:false},{id:recipientId,name:"Maxime Bourdon",isOwnProfile:true}]
      : [{id:recipientId,name:"Client Test"}];
    return reply({data:{clients,total:clients.length,page:0}});
  }
  if (path === "/api/v1/coach/programs/publish") {
    const input = JSON.parse(String(init?.body)) as PublishProgramRequest; publicationRequests.push(input);
    if (scenario === "publication-conflict") return reply({error:{code:"VERSION_CONFLICT"}},409);
    if (scenario === "publication-pilot-recipient-disabled") return reply({error:{code:"PILOT_RECIPIENT_DISABLED",message:"Untrusted server detail must not appear"}},400);
    let result = publicationReceipts.get(input.clientMutationId);
    if (!result) {
      const draft = programRecords.get(input.programId)!;
      result = {id:crypto.randomUUID(),clientId:input.clientId,programId:input.programId,draftVersion:input.draftVersion,revision:1,document:structuredClone(draft.document),publishedAt:new Date(now).toISOString()};
      publicationReceipts.set(input.clientMutationId,result); publication=result;
    }
    if (scenario === "publication-response-lost" && !publicationResponseLost) { publicationResponseLost=true; throw new TypeError("Confirmation lost"); }
    if (scenario === "publication-service-unavailable" && !publicationResponseLost) { publicationResponseLost=true; return reply({error:{code:"TEMPORARILY_UNAVAILABLE"}},503); }
    return reply({data:{program:result}});
  }
  if (path === "/api/v1/client/program" || (path.startsWith("/api/v1/coach/clients/") && path.endsWith("/program"))) {
    if (scenario === "publication-load-error" || scenario === "network") return reply({error:{code:"TEMPORARILY_UNAVAILABLE"}},503);
    return reply({data:{program:publication}});
  }
  if (path.startsWith("/api/v1/coach/programs")) {
    if (scenario === "program-load-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (init?.method === "POST") {
      const input = JSON.parse(String(init.body)) as SaveProgramRequest;
      programRequests.push(input);
      if (scenario === "program-conflict") return reply({ error: { code: "VERSION_CONFLICT" } }, 409);
      let result = programReceipts.get(input.clientMutationId);
      if (!result) {
        result = { id: input.id ?? crypto.randomUUID(), document: input.document, version: input.expectedVersion + 1, createdBy: "19000000-0000-4000-8000-000000000001", updatedAt: new Date(now).toISOString() };
        programRecords.set(result.id, result); programReceipts.set(input.clientMutationId, result);
        programVersionRecords.set(result.id, [...(programVersionRecords.get(result.id) ?? []), structuredClone(result)]);
      }
      if (scenario === "program-response-lost" && !programResponseLost) { programResponseLost = true; throw new TypeError("Response lost after commit"); }
      return reply({ data: { program: result } });
    }
    const parts = new URL(path, window.location.origin).pathname.split("/");
    const id = parts[5];
    if (parts[6] === "history") {
      const versions = programVersionRecords.get(id) ?? [];
      if (parts[7]) {
        const version = versions.find(item => item.version === Number(parts[7]));
        if (scenario === "history-read-delayed") await new Promise<void>((resolve, reject) => {
          Object.assign(window, { __releaseProgramHistory: resolve });
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
        return version ? reply({data:{program:version}}) : reply({error:{code:"NOT_FOUND"}},404);
      }
      const page = Number(parsedPath.searchParams.get("page") ?? 0);
      return reply({data:{items:[...versions].reverse().slice(page*20,page*20+20).map(item => ({version:item.version,updatedAt:item.updatedAt})),total:versions.length,page,pageSize:20}});
    }
    if (id) return programRecords.has(id) ? reply({ data: { program: programRecords.get(id) } }) : reply({ error: { code: "NOT_FOUND" } }, 404);
    return reply({ data: { items: [...programRecords.values()].map((p) => ({ id: p.id, title: p.document.title, version: p.version, weekCount: p.document.weeks.length, updatedAt: p.updatedAt })), total: programRecords.size, page: 0, pageSize: 20 } });
  }
  if (path.startsWith("/api/v1/coach/exercises")) {
    if (scenario === "exercise-load-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    if (init?.method === "POST") {
      const input = JSON.parse(String(init.body)) as SaveExerciseRequest;
      exerciseRequests.push(input);
      if (scenario === "exercise-conflict") return reply({ error: { code: "VERSION_CONFLICT" } }, 409);
      let saved = exerciseReceipts.get(input.clientMutationId);
      if (!saved) {
        saved = { ...input.exercise, id: input.id ?? "18000000-0000-4000-8000-000000000001",
          version: input.expectedVersion + 1, createdBy: "18000000-0000-4000-8000-000000000002",
          updatedAt: new Date(now).toISOString(), canEdit: true };
        exerciseReceipts.set(input.clientMutationId, saved);
        exerciseRecords = [...exerciseRecords.filter((item) => item.id !== saved!.id), saved];
      }
      if (scenario === "exercise-response-lost" && !exerciseResponseLost) {
        exerciseResponseLost = true;
        throw new TypeError("Confirmation lost after commit");
      }
      return reply({ data: { exercise: saved } });
    }
    const query = new URL(path, window.location.origin).searchParams;
    const filtered = exerciseRecords.filter((item) => item.archived === (query.get("archived") === "true") &&
      item.name.toLowerCase().includes((query.get("query") ?? "").toLowerCase()));
    const page = Number(query.get("page") ?? 0);
    return reply({ data: { items: filtered.slice(page * 50, page * 50 + 50), total: filtered.length, page, pageSize: 50 } });
  }
  if (scenario === "network") throw new TypeError("Network unavailable");
  if (
    path.endsWith("/client/me") &&
    scenario === "client-request-hang-once" &&
    clientRequestAttempts++ === 0
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (scenario === "error")
    return reply(
      {
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "Réessaie dans quelques instants.",
        },
      },
      503,
    );
  if (path.endsWith("/client/me"))
    return reply({
      client: {
        clientId: "client-0",
        displayName: "Alex Martin",
        status: "ACTIVE",
        locale: scenario === "english" || harnessParameters.get("language") === "en" ? "en-CA" : "fr-CA",
        timezone: "Asia/Tokyo",
      },
    });
  if (path.endsWith("/coach/personal-client") && init?.method === "POST") {
    if (scenario === "personal-network") {
      throw new TypeError("Network unavailable");
    }
    let command: Record<string, unknown>;
    try {
      command = JSON.parse(String(init.body)) as Record<string, unknown>;
    } catch {
      return reply({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    personalPortalRequests.push(command);
    const expectedKeys = [
      "firstName",
      "idempotencyKey",
      "lastName",
      "locale",
      "timeZone",
    ];
    const strictBody =
      JSON.stringify(Object.keys(command).sort()) === JSON.stringify(expectedKeys)
      && typeof command.firstName === "string"
      && command.firstName.length > 0
      && typeof command.lastName === "string"
      && command.lastName.length > 0
      && (command.locale === "fr-CA" || command.locale === "en-CA")
      && typeof command.timeZone === "string"
      && command.timeZone.length > 0
      && typeof command.idempotencyKey === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        command.idempotencyKey,
      );
    if (!strictBody) {
      return reply({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    if (
      scenario === "personal-success"
      && (
        command.firstName !== "Maxime"
        || command.lastName !== "Coach"
        || command.locale !== "en-CA"
        || command.timeZone !== "Asia/Tokyo"
      )
    ) {
      return reply({ error: { code: "UNEXPECTED_INTENT" } }, 400);
    }
    if (scenario === "personal-error") {
      return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    }
    if (
      scenario === "personal-retry"
      && failedPersonalPortalMutationId === null
    ) {
      failedPersonalPortalMutationId = command.idempotencyKey as string;
      return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    }
    if (
      scenario === "personal-retry"
      && failedPersonalPortalMutationId !== command.idempotencyKey
    ) {
      return reply({ error: { code: "IDEMPOTENCY_KEY_CHANGED" } }, 409);
    }
    return reply({
      data: {
        clientId: "71000000-0000-4000-8000-000000000001",
        redirectTo: "/client",
      },
    }, 201);
  }
  if (path.endsWith("/client/onboarding/submit") && init?.method === "POST") {
    if (scenario === "onboarding-submit-error") return reply({ error: { code: "TEMPORARILY_UNAVAILABLE" } }, 503);
    return reply({ data: { intake: onboardingSnapshot("SUBMITTED") } });
  }
  if (path.endsWith("/client/onboarding") && init?.method === "PUT") {
    onboardingRequests.push(JSON.parse(String(init.body)));
    const command = JSON.parse(String(init.body)) as {
      clientMutationId: string;
      expectedVersion: number;
      responses: OnboardingResponses;
    };
    if (
      scenario === "onboarding-save-error-once"
      && failedOnboardingMutationId === null
    ) {
      failedOnboardingMutationId = command.clientMutationId;
      return reply(
        { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
        503,
      );
    }
    if (
      scenario === "onboarding-save-error-once"
      && failedOnboardingMutationId !== command.clientMutationId
    ) {
      return reply(
        { error: { code: "DUPLICATE", message: "Command changed during retry" } },
        409,
      );
    }
    if (scenario === "onboarding-conflict") {
      onboardingConflictOccurred = true;
      return reply(
        { error: { code: "VERSION_CONFLICT", message: "Version conflict" } },
        409,
      );
    }
    return reply({
      data: {
        intake: {
          ...onboardingSnapshot("DRAFT", command.responses),
          version: command.expectedVersion + 1,
        },
      },
    });
  }
  if (path.endsWith("/client/onboarding")) {
    if (scenario === "onboarding-measurement-draft") {
      return reply({ data: { intake: onboardingSnapshot("DRAFT", { ...EMPTY_ONBOARDING_RESPONSES, height: "5 ft 10 in", currentBodyweight: "185.5 lb" }) } });
    }
    if (scenario === "onboarding-legacy-measurements") {
      return reply({ data: { intake: onboardingSnapshot("DRAFT", { ...EMPTY_ONBOARDING_RESPONSES, height: "Ancienne taille sans unité", currentBodyweight: "Ancien poids sans unité" }) } });
    }
    if (scenario === "onboarding-complete-draft" || scenario === "onboarding-submit-error") {
      return reply({ data: { intake: onboardingSnapshot("DRAFT", completeOnboardingResponses()) } });
    }
    if (scenario === "onboarding-action-error") {
      return reply(
        { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
        503,
      );
    }
    if (scenario === "onboarding-draft") {
      return reply({ data: { intake: onboardingSnapshot("DRAFT") } });
    }
    if (scenario === "onboarding-conflict" && onboardingConflictOccurred) {
      const saved = structuredClone(
        EMPTY_ONBOARDING_RESPONSES,
      ) as OnboardingResponses;
      saved.fullName = "Alex Version enregistrée";
      saved.email = "alex@example.test";
      return reply({ data: { intake: onboardingSnapshot("DRAFT", saved) } });
    }
    if (
      scenario === "onboarding-not-started"
      || scenario === "onboarding-save-error-once"
      || scenario === "onboarding-conflict"
    ) {
      return reply({ data: { intake: onboardingSnapshot("NOT_STARTED") } });
    }
    return reply({ data: { intake: onboardingSnapshot("SUBMITTED") } });
  }
  if (path.endsWith("/client/week-zero/submit") && init?.method === "POST") {
    const submitted = assessmentSnapshot("SUBMITTED");
    return reply({ data: { assessment: submitted } });
  }
  if (path.endsWith("/client/week-zero") && init?.method === "PUT") {
    const command = JSON.parse(String(init.body)) as {
      clientMutationId: string;
      expectedVersion: number;
      responses: typeof EMPTY_INITIAL_ASSESSMENT_RESPONSES;
    };
    if (scenario === "assessment-save-error-once" && failedSaveMutationId === null) {
      failedSaveMutationId = command.clientMutationId;
      return reply(
        { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
        503,
      );
    }
    if (
      scenario === "assessment-save-error-once" &&
      failedSaveMutationId !== command.clientMutationId
    ) {
      return reply(
        { error: { code: "DUPLICATE", message: "Command changed during retry" } },
        409,
      );
    }
    if (scenario === "assessment-conflict") {
      assessmentConflictOccurred = true;
      return reply(
        { error: { code: "VERSION_CONFLICT", message: "Version conflict" } },
        409,
      );
    }
    return reply({
      data: {
        assessment: {
          kind: "INITIAL_ASSESSMENT",
          schemaVersion: 1,
          status: "DRAFT",
          version: command.expectedVersion + 1,
          responses: command.responses,
          updatedAt: new Date(now).toISOString(),
          submittedAt: null,
        },
      },
    });
  }
  if (path.endsWith("/client/week-zero")) {
    if (scenario === "assessment-draft") {
      return reply({ data: { assessment: assessmentSnapshot("DRAFT") } });
    }
    if (scenario === "assessment-submitted" || scenario === "legacy-assessment-submitted" || scenario === "program-published") {
      return reply({ data: { assessment: assessmentSnapshot("SUBMITTED") } });
    }
    if (scenario === "assessment-conflict" && assessmentConflictOccurred) {
      const saved = assessmentSnapshot("DRAFT");
      saved.responses.measurements.bodyWeightLb = 199;
      return reply({ data: { assessment: saved } });
    }
    return reply({ data: { assessment: assessmentSnapshot() } });
  }
  if (path.endsWith("/coach/clients") && !init?.method) {
    const clients = scenario === "same-name-clients" ? [false,true].map((isOwnProfile,index)=>({
      ...records[0],id:index ? "personal" : "ordinary",firstName:"Maxime",lastName:"Bourdon",
      email:index ? "owner@example.test" : "other@example.test",status:"ACTIVE",invitation:null,isOwnProfile,
    })) : scenario === "empty" ? [] : records;
    return reply({ data: { clients } });
  }
  if (path.endsWith("/coach/clients") && init?.method === "POST") {
    const values = JSON.parse(String(init.body));
    const record = {
      ...records[1],
      ...values,
      id: "created",
      displayName: `${values.firstName} ${values.lastName}`,
      invitation: { ...records[1].invitation, id: "new-invitation" },
    };
    records = [record, ...records];
    return reply({
      data: {
        client: record,
        invitation: record.invitation,
        deliveryQueued: true,
      },
    });
  }
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-hang"
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-error"
  )
    return reply(
      { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
      503,
    );
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-unauthorized"
  )
    return reply(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      401,
    );
  if (path.endsWith("/auth/coach-email-otp/request"))
    return reply(
      {
        data: {
          accepted: true,
          emailHint: "m••••@gmail.com",
          retryAfterSeconds: 1,
        },
      },
      202,
    );
  if (
    path.endsWith("/auth/coach-email-otp/verify") &&
    scenario === "coach-verify-rate-limit"
  )
    return reply(
      { error: { code: "RATE_LIMITED", message: "Too many attempts" } },
      429,
    );
  if (path.endsWith("/auth/coach-email-otp/verify"))
    return reply(
      { error: { code: "UNAUTHENTICATED", message: "Invalid or expired code" } },
      401,
    );
  if (
    path.endsWith("/auth/coach-logout") &&
    scenario === "coach-logout-hang"
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  if (path.endsWith("/auth/coach-logout"))
    return reply({ data: { signedOut: true, redirectTo: "/login" } });
  if (path.includes("/invitations/")) {
    const id = path.split("/").at(-3);
    records = records.map((record) =>
      record.id === id
        ? {
            ...record,
            invitation: {
              ...record.invitation,
              status: path.endsWith("/revoke") ? "REVOKED" : "PENDING",
            },
          }
        : record,
    );
    const record = records.find((record) => record.id === id)!;
    return reply({
      data: {
        client: record,
        invitation: record.invitation,
        deliveryQueued: true,
      },
    });
  }
  if (path.includes("/verify")) {
    message = "Vérification simulée reçue";
    return reply(
      { error: { message: "Le code est invalide ou expiré." } },
      400,
    );
  }
  if (path.includes("/activation"))
    return reply({
      invitation: {
        invitationId: "invitation",
        emailHint: "a•••@example.test",
        locale: "fr-CA",
        expiresAt: new Date(now + 604800000).toISOString(),
        state: "PENDING",
      },
    });
  return reply({ data: {} });
};
function CodeExercise() {
  const [code, setCode] = useState("");
  return (
    <AuthShell>
      <h1 className="fe-title">Test de saisie</h1>
      <form className="fe-form" onSubmit={(event) => event.preventDefault()}>
        <CodeInput value={code} onChange={setCode} />
        <output aria-label="Code de test">{JSON.stringify(code)}</output>
        <button className="fe-button" disabled={!/^\d{6}$/.test(code)}>
          Continuer
        </button>
      </form>
    </AuthShell>
  );
}
function Harness() {
  const initialView = harnessScreen;
  const [view, setView] = useState(initialView ?? "coach");
  const [key, setKey] = useState(0);
  if (view === "exercise-library") return <ExerciseLibrary />;
  if (view === "exercise-pilot") return <main style={{ padding: "1rem" }}><ExercisePilot /></main>;
  if (view === "program-builder") return <ProgramBuilder />;
  if (view === "client-program") return <ClientProgram />;
  if (view === "client-workout") return <ClientWorkout />;
  if (view === "coach-workouts") return <CoachWorkoutResults clientId={recipientId} />;
  if (view === "landing-en" || view === "landing-fr") {
    return <LandingPage locale={view === "landing-fr" ? "fr" : "en"} />;
  }
  if (view === "client-v2") {
    return <ClientDashboard loadTimeoutMs={5_000} />;
  }
  if (view === "client-v2-staff") {
    return <PortalAccessProvider isStaff>
      <ClientDashboard loadTimeoutMs={5_000} />
    </PortalAccessProvider>;
  }
  if (view === "client-today-staff") {
    return <PortalAccessProvider isStaff>
      <ClientDashboard view="today" loadTimeoutMs={5_000} />
    </PortalAccessProvider>;
  }
  if (view === "client-week-zero") {
    return <ClientWeekZero />;
  }
  if (view === "coach-week-zero") {
    return <AppShell space="coach" current="clients"><CoachWeekZeroAcquisition clientId="76000000-0000-4000-8000-000000000010" timezone="America/Toronto" /></AppShell>;
  }
  if (view === "client-onboarding") {
    return <ClientOnboarding reviewSubmittedResponses={harnessParameters.get("view") === "responses"} />;
  }
  if (view === "personal-portal-setup") {
    return <AppShell space="coach" current="personal">
      <PersonalPortalSetup requestTimeoutMs={350} />
    </AppShell>;
  }
  return (
    <>
      <header
        style={{
          padding: 12,
          background: "#fff",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <strong>Test UI · données fictives</strong>
        <label>
          Écran{" "}
          <select
            value={view}
            onChange={(event) => {
              setView(event.target.value);
              setKey(key + 1);
            }}
          >
            <option value="coach">Coach</option>
            <option value="landing-en">Landing · English</option>
            <option value="landing-fr">Landing · Français</option>
            <option value="client">Client</option>
            <option value="client-v2">Client · Pilote V2</option>
            <option value="client-v2-staff">Client · Pilote V2 · Staff</option>
            <option value="client-today">Client · Aujourd’hui</option>
            <option value="client-today-staff">Client · Aujourd’hui · Staff</option>
            <option value="client-onboarding">Client · Questionnaire d’accueil</option>
            <option value="client-week-zero">Client · Week Zero</option>
            <option value="client-program">Client · Programme</option>
            <option value="client-workout">Client · Résultats de séance</option>
            <option value="coach-workouts">Coach · Résultats Client</option>
            <option value="personal-portal-setup">Coach · Portail personnel</option>
            <option value="login">Connexion Client</option>
            <option value="activation">Activation</option>
            <option value="verify-email">Vérification Coach</option>
            <option value="code">Saisie code</option>
          </select>
        </label>
        <label>
          État{" "}
          <select
            onChange={(event) => {
              scenario = event.target.value;
              clientRequestAttempts = 0;
              failedSaveMutationId = null;
              assessmentConflictOccurred = false;
              handleAcquisition = createAcquisitionFixture();
              failedOnboardingMutationId = null;
              onboardingConflictOccurred = false;
              failedPersonalPortalMutationId = null;
              personalPortalRequests.length = 0;
              setKey(key + 1);
            }}
          >
            <option value="normal">Normal</option>
            <option value="empty">Vide</option>
            <option value="error">Erreur API</option>
            <option value="network">Réseau coupé</option>
            <option value="client-request-hang-once">Client · chargement suspendu</option>
            <option value="coach-request-hang">Coach · envoi suspendu</option>
            <option value="coach-request-error">Coach · échec d’envoi</option>
            <option value="coach-request-unauthorized">Coach · session expirée</option>
            <option value="coach-verify-rate-limit">Coach · trop d’essais</option>
            <option value="coach-logout-hang">Coach · déconnexion suspendue</option>
            <option value="english">English Client</option>
          </select>
        </label>
        <span role="status">{message}</span>
      </header>
      <div key={key}>
        {view === "coach" ? (
          <CoachDashboard />
        ) : view === "client" ? (
          <ClientDashboard loadTimeoutMs={350} />
        ) : view === "client-today" ? (
          <ClientDashboard view="today" loadTimeoutMs={350} />
        ) : view === "login" ? (
          <ClientLoginCard />
        ) : view === "activation" ? (
          <ClientActivationCard />
        ) : view === "verify-email" ? (
          <CoachEmailVerificationCard requestTimeoutMs={350} />
        ) : (
          <CodeExercise />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
