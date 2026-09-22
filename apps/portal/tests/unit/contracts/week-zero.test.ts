import { describe, expect, it } from "vitest";

import {
  EMPTY_INITIAL_ASSESSMENT_RESPONSES,
  completeInitialAssessmentResponsesSchema,
  initialAssessmentResponsesSchema,
  isInitialAssessmentComplete,
  saveInitialAssessmentRequestSchema,
} from "@/lib/contracts/week-zero";

function completeResponses() {
  return {
    ...structuredClone(EMPTY_INITIAL_ASSESSMENT_RESPONSES),
    measurements: {
      ...EMPTY_INITIAL_ASSESSMENT_RESPONSES.measurements,
      bodyWeightLb: 224.5,
      waistIn: 41,
    },
    mobility: {
      ...EMPTY_INITIAL_ASSESSMENT_RESPONSES.mobility,
      painSquat: "NO" as const,
      painHinge: "YES" as const,
      painPush: "NO" as const,
      painPull: "NO" as const,
      painCardio: "NO" as const,
      limitedMovement: "N.A.",
      comfortableMovement: "Marche",
      tightArea: "Hanches",
    },
  };
}

describe("initial assessment contract", () => {
  it("uses not-assessed pain defaults instead of manufacturing negative answers", () => {
    expect(EMPTY_INITIAL_ASSESSMENT_RESPONSES.mobility).toMatchObject({
      painSquat: "NOT_ASSESSED",
      painHinge: "NOT_ASSESSED",
      painPush: "NOT_ASSESSED",
      painPull: "NOT_ASSESSED",
      painCardio: "NOT_ASSESSED",
    });
    expect(isInitialAssessmentComplete(EMPTY_INITIAL_ASSESSMENT_RESPONSES)).toBe(false);
  });

  it("accepts the required measures and explicit mobility answers without requiring planning", () => {
    const responses = completeResponses();
    expect(completeInitialAssessmentResponsesSchema.parse(responses)).toEqual(responses);
    expect(isInitialAssessmentComplete(responses)).toBe(true);
  });

  it("accepts broad Legacy-compatible numeric values but rejects invalid ranges", () => {
    expect(
      initialAssessmentResponsesSchema.safeParse({
        ...completeResponses(),
        measurements: { ...completeResponses().measurements, bodyWeightLb: 1_500 },
        availability: {
          ...completeResponses().availability,
          sessionDurationMinutes: 480,
          sessionsPerWeek: 7,
        },
      }).success,
    ).toBe(true);
    expect(
      initialAssessmentResponsesSchema.safeParse({
        ...completeResponses(),
        measurements: { ...completeResponses().measurements, bodyWeightLb: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and non-UUID mutation identifiers", () => {
    expect(
      saveInitialAssessmentRequestSchema.safeParse({
        expectedVersion: 0,
        clientMutationId: "not-a-uuid",
        responses: { ...completeResponses(), unsafe: "ignored?" },
      }).success,
    ).toBe(false);
  });
});
