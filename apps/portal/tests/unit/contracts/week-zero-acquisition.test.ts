import { describe, expect, it } from "vitest";

import {
  EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES,
  WEEK_ZERO_MOVEMENT_KEYS,
  completeWeekZeroAcquisitionResponsesSchema,
  weekZeroAcquisitionResponsesSchema,
  weekZeroAcquisitionSnapshotSchema,
  type WeekZeroAcquisitionResponses,
} from "@/lib/contracts/week-zero-acquisition";

const IDS = {
  front: "11111111-1111-4111-8111-111111111111",
  side: "22222222-2222-4222-8222-222222222222",
  back: "33333333-3333-4333-8333-333333333333",
};

function cloneEmpty(): WeekZeroAcquisitionResponses {
  return structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES);
}

function completeSkippedAcquisition(): WeekZeroAcquisitionResponses {
  const responses = cloneEmpty();
  responses.instructionsAccepted = true;
  responses.photos = { ...IDS, notes: null };
  responses.measurements.bodyWeightLb = 200;
  responses.measurements.waistIn = 40;
  for (const movement of WEEK_ZERO_MOVEMENT_KEYS) {
    responses.loads[movement] = {
      ...responses.loads[movement],
      status: "NOT_PERFORMED",
      reason: "Equipment unavailable",
    };
  }
  responses.cardio = {
    ...responses.cardio,
    status: "NOT_PERFORMED",
    reason: "No Concept2 available",
  };
  responses.mobility = {
    painSquat: "NOT_PERFORMED",
    painHinge: "NOT_PERFORMED",
    painPush: "NOT_PERFORMED",
    painPull: "NOT_PERFORMED",
    painCardio: "NOT_PERFORMED",
    limitedMovement: "N.A.",
    comfortableMovement: "N.A.",
    tightArea: "N.A.",
  };
  return responses;
}

describe("Week Zero acquisition contract", () => {
  it("accepts an empty draft without presenting it as complete", () => {
    expect(weekZeroAcquisitionResponsesSchema.safeParse(cloneEmpty()).success).toBe(true);
    expect(completeWeekZeroAcquisitionResponsesSchema.safeParse(cloneEmpty()).success).toBe(false);
  });

  it("accepts partially entered DONE values for draft autosave", () => {
    const responses = cloneEmpty();
    responses.loads.horizontalPress.status = "DONE";
    responses.loads.horizontalPress.variant = "DUMBBELL_PRESS";
    responses.cardio.status = "DONE";
    responses.cardio.age = 40;

    expect(weekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(true);
    expect(completeWeekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(false);
  });

  it("accepts an explicitly not-performed but honest complete acquisition", () => {
    expect(completeWeekZeroAcquisitionResponsesSchema.safeParse(completeSkippedAcquisition()).success)
      .toBe(true);
  });

  it("rejects a missing reason at submission but permits it while drafting", () => {
    const responses = completeSkippedAcquisition();
    responses.loads.squat.reason = null;
    expect(weekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(true);
    expect(completeWeekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(false);
  });

  it("rejects incompatible load modes instead of changing their meaning", () => {
    const responses = cloneEmpty();
    responses.loads.pullUps = {
      status: "DONE",
      variant: "PULL_UPS",
      mode: "PER_HAND",
      load: 25,
      unit: "LB",
      reps: 5,
      rir: null,
      reason: null,
      note: null,
    };
    expect(weekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(false);
  });

  it("accepts a performed calibration without inventing RIR", () => {
    const responses = completeSkippedAcquisition();
    responses.loads.horizontalPress = {
      status: "DONE",
      variant: "DUMBBELL_PRESS",
      mode: "PER_HAND",
      load: 45,
      unit: "LB",
      reps: 10,
      rir: null,
      reason: null,
      note: "Controlled",
    };
    expect(completeWeekZeroAcquisitionResponsesSchema.safeParse(responses).success).toBe(true);
  });

  it("rejects fake photo booleans, unknown keys, and excessive load precision", () => {
    const fakePhoto = { ...cloneEmpty(), photos: { ...cloneEmpty().photos, front: true } };
    expect(weekZeroAcquisitionResponsesSchema.safeParse(fakePhoto).success).toBe(false);

    const unknown = { ...cloneEmpty(), extra: "not allowed" };
    expect(weekZeroAcquisitionResponsesSchema.safeParse(unknown).success).toBe(false);

    const precise = cloneEmpty();
    precise.loads.squat = {
      status: "DONE",
      variant: "BARBELL_SQUAT",
      mode: "TOTAL",
      load: 100.0001,
      unit: "LB",
      reps: 5,
      rir: null,
      reason: null,
      note: null,
    };
    expect(weekZeroAcquisitionResponsesSchema.safeParse(precise).success).toBe(false);
  });

  it("requires derived data to be explicit and internally consistent at the API boundary", () => {
    const responses = completeSkippedAcquisition();
    expect(
      weekZeroAcquisitionSnapshotSchema.safeParse({
        kind: "WEEK_ZERO_ACQUISITION",
        schemaVersion: 1,
        status: "SUBMITTED",
        version: 2,
        responses,
        derived: { cardio: null },
        updatedAt: "2026-10-20T10:00:00.000Z",
        submittedAt: "2026-10-20T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
