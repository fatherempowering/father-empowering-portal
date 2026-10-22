import { describe, expect, it } from "vitest";

import { EMPTY_ONBOARDING_RESPONSES } from "@/lib/contracts/onboarding";
import { parseCoachOnboardingApiEnvelope } from "./coach-onboarding-detail-contract";

const clientId = "41000000-0000-4000-8000-000000000001";

function submittedPayload() {
  return {
    data: {
      client: {
        id: clientId,
        displayName: "Max Exemple",
        email: "max@example.com",
        locale: "fr-CA",
        timezone: "America/Toronto",
      },
      intake: {
        kind: "ONBOARDING_INTAKE",
        schemaVersion: 1,
        status: "SUBMITTED",
        version: 2,
        responses: {
          ...EMPTY_ONBOARDING_RESPONSES,
          fullName: "Max Exemple",
          doesCardio: "YES",
        },
        updatedAt: "2026-09-22T14:00:00-04:00",
        submittedAt: "2026-09-22T14:00:00-04:00",
      },
    },
  };
}

describe("Coach onboarding API boundary", () => {
  it("accepts the exact submitted snapshot for the requested Client", () => {
    expect(
      parseCoachOnboardingApiEnvelope(submittedPayload(), clientId).data,
    ).not.toBeNull();
  });

  it("accepts the maximum Client display name in the Coach header", () => {
    const payload = submittedPayload();
    payload.data.client.displayName = `${"A".repeat(120)} ${"B".repeat(120)}`;

    expect(
      parseCoachOnboardingApiEnvelope(payload, clientId).data?.client.displayName,
    ).toHaveLength(241);
  });

  it("rejects a malformed successful payload before presentation", () => {
    const payload = submittedPayload();
    payload.data.intake.responses = { fullName: "Incomplete" } as never;

    expect(parseCoachOnboardingApiEnvelope(payload, clientId).data).toBeNull();
  });

  it("rejects a valid envelope belonging to another Client", () => {
    expect(
      parseCoachOnboardingApiEnvelope(
        submittedPayload(),
        "41000000-0000-4000-8000-000000000002",
      ).data,
    ).toBeNull();
  });

  it("parses the canonical verification denial without trusting its message", () => {
    expect(
      parseCoachOnboardingApiEnvelope(
        {
          error: {
            code: "FORBIDDEN",
            message: "Untrusted detail",
          },
        },
        clientId,
      ).error,
    ).toEqual({ code: "FORBIDDEN" });
  });
});
