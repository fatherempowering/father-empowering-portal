import { beforeEach, describe, expect, it, vi } from "vitest";

import { M1ContractError } from "@/lib/contracts/m1";
import { EMPTY_ONBOARDING_RESPONSES } from "@/lib/contracts/onboarding";

const repository = vi.hoisted(() => ({
  getOwnOnboardingIntake: vi.fn(),
  saveOwnOnboardingIntake: vi.fn(),
  submitOwnOnboardingIntake: vi.fn(),
  getCoachClientOnboardingIntake: vi.fn(),
}));
const origin = vi.hoisted(() => ({ requireSameOrigin: vi.fn() }));

vi.mock("@/lib/onboarding/onboarding-repository", () => repository);
vi.mock("@/lib/http/origin", () => origin);

import {
  getOwnOnboardingHttp,
  saveOwnOnboardingHttp,
} from "@/features/onboarding/server/http";

const emptySnapshot = {
  kind: "ONBOARDING_INTAKE" as const,
  schemaVersion: 1 as const,
  status: "NOT_STARTED" as const,
  version: 0,
  responses: EMPTY_ONBOARDING_RESPONSES,
  updatedAt: null,
  submittedAt: null,
};

describe("onboarding HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin.requireSameOrigin.mockReset();
    repository.getOwnOnboardingIntake.mockResolvedValue(emptySnapshot);
    repository.saveOwnOnboardingIntake.mockResolvedValue({
      ...emptySnapshot,
      status: "DRAFT",
      version: 1,
      updatedAt: "2026-09-22T12:00:00.000Z",
    });
  });

  it("returns a private no-store intake envelope", async () => {
    const response = await getOwnOnboardingHttp();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ data: { intake: emptySnapshot } });
  });

  it("requires the canonical same-origin guard before mutation", async () => {
    origin.requireSameOrigin.mockImplementation(() => {
      throw new M1ContractError("FORBIDDEN", "Cross-origin mutation denied", 403);
    });
    const response = await saveOwnOnboardingHttp(
      new Request("https://internal.invalid/api/v1/client/onboarding", {
        method: "PUT",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.saveOwnOnboardingIntake).not.toHaveBeenCalled();
  });

  it("validates and forwards the exact 64-key response structure", async () => {
    const body = {
      expectedVersion: 0,
      clientMutationId: "66000000-0000-4000-8000-000000000001",
      responses: EMPTY_ONBOARDING_RESPONSES,
    };
    const response = await saveOwnOnboardingHttp(
      new Request("https://app.example/api/v1/client/onboarding", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(repository.saveOwnOnboardingIntake).toHaveBeenCalledWith(body);
  });

  it("rejects a body over the 256 KiB contract before repository access", async () => {
    const response = await saveOwnOnboardingHttp(
      new Request("https://app.example/api/v1/client/onboarding", {
        method: "PUT",
        body: "{}",
        headers: { "content-type": "application/json", "content-length": "262145" },
      }),
    );
    expect(response.status).toBe(400);
    expect(repository.saveOwnOnboardingIntake).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });
});
