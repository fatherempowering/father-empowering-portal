import { describe, expect, it } from "vitest";

import {
  type SaveWorkoutRequest,
  type WorkoutSnapshot,
  saveWorkoutRequestSchema,
  workoutListSchema,
  workoutSessionResponseSchema,
  workoutSnapshotSchema,
} from "@/lib/contracts/training-results";
import { pilotResultExercise } from "./pilot-result-fixture";

const ids = {
  publication: "a1000000-0000-4000-8000-000000000001",
  mutation: "a1000000-0000-4000-8000-000000000002",
  session: "a1000000-0000-4000-8000-000000000003",
  exercise: "a1000000-0000-4000-8000-000000000004",
  workout: "a1000000-0000-4000-8000-000000000005",
  client: "a1000000-0000-4000-8000-000000000006",
  program: "a1000000-0000-4000-8000-000000000007",
  phase: "a1000000-0000-4000-8000-000000000008",
  block: "a1000000-0000-4000-8000-000000000009",
  libraryExercise: "a1000000-0000-4000-8000-000000000010",
};

function request(): SaveWorkoutRequest {
  return {
    publicationId: ids.publication,
    weekNumber: 1,
    sessionId: ids.session,
    expectedVersion: 0,
    clientMutationId: ids.mutation,
    status: "IN_PROGRESS" as const,
    sets: [{
      exerciseId: ids.exercise, setNumber: 1, status: "PENDING" as const,
      reps: null, load: null, rir: null,
    }],
    note: null,
  };
}

const session = {
  id: ids.session,
  title: { fr: "Séance A", en: "Session A" },
  type: "training" as const,
  required: true,
  schedule: { mode: "flexible" as const, day: null },
  warmup: { fr: "", en: "" },
  blocks: [{
    id: ids.block,
    label: { fr: "", en: "" },
    mode: "standard" as const,
    restSeconds: 90,
    exercises: [{
      id: ids.exercise,
      libraryExerciseId: ids.libraryExercise,
      name: "Press",
      cue: { fr: "", en: "" },
      media: null,
      prescription: { sets: 1, reps: "8", targetRir: 2, restSeconds: 90, tempo: "", loadTarget: "40 lb", unit: "lb" as const },
    }],
  }],
};

function snapshot(): WorkoutSnapshot {
  return {
    id: ids.workout,
    publicationId: ids.publication,
    weekNumber: 1,
    sessionId: ids.session,
    version: 1,
    status: "IN_PROGRESS" as const,
    sets: [{
      exerciseId: ids.exercise, setNumber: 1, status: "PENDING" as const,
      reps: null, load: null, rir: null, kind: "PRESCRIBED" as const, unit: "lb" as const,
    }],
    note: null,
    startedAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
    completedAt: null,
    session,
    programTitle: { fr: "Force", en: "Strength" },
    publicationRevision: 1,
  };
}

describe("training result contracts", () => {
  it("accepts an explicit partial save", () => {
    expect(saveWorkoutRequestSchema.parse(request()).status).toBe("IN_PROGRESS");
  });

  it("rejects duplicate set identities and contradictory measurements", () => {
    const input = request();
    input.sets.push({ ...input.sets[0]!, exerciseId: input.sets[0]!.exerciseId.toUpperCase(), reps: 8 });
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(false);
  });

  it("requires a note for skipped sets and rejects pending sets on completion", () => {
    const skipped = request();
    skipped.sets[0] = { ...skipped.sets[0]!, status: "SKIPPED" };
    expect(saveWorkoutRequestSchema.safeParse(skipped).success).toBe(false);
    const completed = request();
    completed.status = "COMPLETED";
    expect(saveWorkoutRequestSchema.safeParse(completed).success).toBe(false);
  });

  it("requires a measured value for DONE without inventing RIR", () => {
    const input = request();
    input.sets[0] = { ...input.sets[0]!, status: "DONE", reps: null, load: null, rir: null };
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(false);
    input.sets[0] = { ...input.sets[0]!, load: 12.5 };
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(true);
  });

  it("keeps measured loads to six decimal places so maximum responses remain bounded", () => {
    const input = request();
    input.sets[0] = { ...input.sets[0]!, status: "DONE", reps: 8, load: 99_999.999999 };
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(true);
    input.sets[0] = { ...input.sets[0]!, load: 0.0000001 };
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(false);
  });

  it("bounds the workout note", () => {
    const input = request();
    input.note = "é".repeat(2_001);
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(false);
  });

  it("accepts 1,020 prescribed set identities without an artificial low cap", () => {
    const input = request();
    input.sets = Array.from({ length: 1_020 }, (_, index) => ({
      exerciseId: `a2000000-0000-4000-8000-${String(Math.floor(index / 20) + 1).padStart(12, "0")}`,
      setNumber: index % 20 + 1,
      status: "PENDING" as const,
      reps: null,
      load: null,
      rir: null,
    }));
    expect(saveWorkoutRequestSchema.safeParse(input).success).toBe(true);
  });

  it("validates server-derived set metadata and completion state", () => {
    expect(workoutSnapshotSchema.safeParse(snapshot()).success).toBe(true);
    const invalid = snapshot();
    invalid.status = "COMPLETED";
    expect(workoutSnapshotSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects carry distance missing weights and a unit that disagrees with its frozen prescription", () => {
    const workout = snapshot();
    const carry = pilotResultExercise("DB_045");
    workout.session = structuredClone(session);
    workout.session.blocks[0]!.exercises = [carry];
    workout.sets = [{ exerciseId: carry.id, setNumber: 1, status: "DONE", kind: "PRESCRIBED", unit: "distance",
      reps: null, load: 30, rir: null }];
    expect(workoutSnapshotSchema.safeParse(workout).success).toBe(false);
    workout.sets[0]!.details = "2 haltères de 25 lb";
    expect(workoutSnapshotSchema.safeParse(workout).success).toBe(true);
    workout.sets[0]!.unit = "lb";
    workout.sets[0]!.reps = 8;
    expect(workoutSnapshotSchema.safeParse(workout).success).toBe(false);
  });

  it("accepts a configuration snapshot without resistance and rejects forged numeric resistance", () => {
    const workout = snapshot();
    const band = pilotResultExercise("BA_027");
    workout.session = structuredClone(session);
    workout.session.blocks[0]!.exercises = [band];
    workout.sets = [{ exerciseId: band.id, setNumber: 1, status: "DONE", kind: "PRESCRIBED", unit: "configuration",
      reps: 10, load: null, rir: null, details: "Bande rouge, ancrage poitrine" }];
    expect(workoutSnapshotSchema.safeParse(workout).success).toBe(true);
    workout.sets[0]!.load = 0;
    expect(workoutSnapshotSchema.safeParse(workout).success).toBe(false);
  });

  it("keeps a historical workout tied to the matching immutable publication", () => {
    const workout = { ...snapshot() } as Record<string, unknown>;
    delete workout.session;
    const publishedSession = { ...session, id: session.id.toUpperCase() };
    const publication = {
      id: ids.publication,
      clientId: ids.client,
      programId: ids.program,
      draftVersion: 1,
      revision: 1,
      document: {
        schemaVersion: 1,
        phaseId: ids.phase,
        title: { fr: "Force", en: "Strength" },
        weeks: [{ number: 1, objective: { fr: "", en: "" }, sessions: [publishedSession] }],
      },
      publishedAt: "2026-10-14T11:00:00.000Z",
    };
    const response = workoutSessionResponseSchema.parse({ workout, publication });
    expect(response.workout?.session.id).toBe(ids.session.toUpperCase());
    expect(workoutSessionResponseSchema.safeParse({
      workout: { ...workout, publicationId: ids.program }, publication,
    }).success).toBe(false);
  });

  it("keeps history pages compact while preserving session identity", () => {
    const workout = snapshot();
    const item = {
      id: workout.id,
      publicationId: workout.publicationId,
      weekNumber: workout.weekNumber,
      sessionId: workout.sessionId,
      version: workout.version,
      status: workout.status,
      startedAt: workout.startedAt,
      updatedAt: workout.updatedAt,
      completedAt: workout.completedAt,
      session: { id: workout.session.id, title: workout.session.title, type: workout.session.type },
      programTitle: workout.programTitle,
      publicationRevision: workout.publicationRevision,
    };
    expect(workoutListSchema.safeParse({ items: [item], total: 1, page: 0, pageSize: 20 }).success).toBe(true);
    expect("sets" in item).toBe(false);
  });
});
