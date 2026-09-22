import { describe, expect, it } from "vitest";

import { parseCoachClientApiEnvelope } from "./coach-client-detail-contract";

const validPayload = {
  data: {
    client: {
      id: "41000000-0000-4000-8000-000000000001",
      displayName: "Max Exemple",
      email: "max@example.com",
      locale: "fr-CA",
      timezone: "America/Toronto",
    },
    assessment: {
      kind: "INITIAL_ASSESSMENT",
      schemaVersion: 1,
      status: "NOT_SUBMITTED",
      version: 0,
      responses: null,
      updatedAt: null,
      submittedAt: null,
    },
  },
};

describe("Coach client detail API boundary", () => {
  it("accepts the shared Coach snapshot and client identity shape", () => {
    expect(parseCoachClientApiEnvelope(validPayload).data).toEqual(
      validPayload.data,
    );
  });

  it("rejects a malformed successful payload before it reaches the UI", () => {
    const malformed = structuredClone(validPayload);
    malformed.data.assessment.responses = {
      measurements: null,
    } as never;

    expect(parseCoachClientApiEnvelope(malformed)).toEqual({
      data: null,
      error: null,
    });
  });

  it("parses the canonical forbidden code independently from data", () => {
    expect(
      parseCoachClientApiEnvelope({
        error: {
          code: "FORBIDDEN",
          message: "Coach email verification is required",
        },
      }).error,
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
