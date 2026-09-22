import { beforeEach, describe, expect, it, vi } from "vitest";

import { M1ContractError } from "@/lib/contracts/m1";
import { EMPTY_INITIAL_ASSESSMENT_RESPONSES } from "@/lib/contracts/week-zero";

const repository = vi.hoisted(() => ({
  getOwnInitialAssessment: vi.fn(),
  saveOwnInitialAssessment: vi.fn(),
  submitOwnInitialAssessment: vi.fn(),
  getCoachClientInitialAssessment: vi.fn(),
}));
const origin = vi.hoisted(() => ({ requireSameOrigin: vi.fn() }));

vi.mock("@/lib/week-zero/initial-assessment-repository", () => repository);
vi.mock("@/lib/http/origin", () => origin);

import {
  getOwnInitialAssessmentHttp,
  saveOwnInitialAssessmentHttp,
} from "@/features/week-zero/server/http";

const emptySnapshot = {
  kind: "INITIAL_ASSESSMENT" as const,
  schemaVersion: 1 as const,
  status: "NOT_STARTED" as const,
  version: 0,
  responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
  updatedAt: null,
  submittedAt: null,
};

describe("initial assessment HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin.requireSameOrigin.mockReset();
    repository.getOwnInitialAssessment.mockResolvedValue(emptySnapshot);
    repository.saveOwnInitialAssessment.mockResolvedValue({
      ...emptySnapshot,
      status: "DRAFT",
      version: 1,
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
  });

  it("returns a private no-store initial snapshot", async () => {
    const response = await getOwnInitialAssessmentHttp();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ data: { assessment: emptySnapshot } });
  });

  it("requires the canonical same-origin guard before a Client mutation", async () => {
    origin.requireSameOrigin.mockImplementation(() => {
      throw new M1ContractError("FORBIDDEN", "Cross-origin mutation denied", 403);
    });
    const response = await saveOwnInitialAssessmentHttp(
      new Request("https://internal.invalid/api/v1/client/week-zero", {
        method: "PUT",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
    expect(repository.saveOwnInitialAssessment).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("validates and forwards only the strict mutation contract", async () => {
    const body = {
      expectedVersion: 0,
      clientMutationId: "65000000-0000-4000-8000-000000000001",
      responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
    };
    const response = await saveOwnInitialAssessmentHttp(
      new Request("https://app.example/api/v1/client/week-zero", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.saveOwnInitialAssessment).toHaveBeenCalledWith(body);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects an oversized declared body before repository access", async () => {
    const response = await saveOwnInitialAssessmentHttp(
      new Request("https://app.example/api/v1/client/week-zero", {
        method: "PUT",
        body: "{}",
        headers: {
          "content-type": "application/json",
          "content-length": "32769",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(repository.saveOwnInitialAssessment).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });
});
