import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  card: vi.fn(() => null),
  redirect: vi.fn(),
  requireVerified: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    mocks.redirect(destination);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth/actor", () => ({
  getServerActor: mocks.actor,
  requireCoachVerified: mocks.requireVerified,
}));
vi.mock("@/features/coach/auth/coach-email-verification-card", () => ({
  CoachEmailVerificationCard: mocks.card,
}));

import VerifyEmailPage from "@/app/verify-email/page";
import { M1ContractError } from "@/lib/contracts/m1";

const coach = {
  userId: "11000000-0000-4000-8000-000000000001",
  organizationId: "21000000-0000-4000-8000-000000000001",
  membershipId: "31000000-0000-4000-8000-000000000001",
  clientId: null,
  role: "COACH",
  aal: "aal1",
};

describe("Coach email verification page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.actor.mockResolvedValue(coach);
    mocks.requireVerified.mockRejectedValue(
      new M1ContractError(
        "FORBIDDEN",
        "Coach email verification is required",
        403,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the explicit email-code experience for an authenticated Coach", async () => {
    const page = await VerifyEmailPage();

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(mocks.card);
  });

  it("returns an unauthenticated visitor to login", async () => {
    mocks.actor.mockResolvedValue(null);

    await expect(VerifyEmailPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("sends an already verified Coach directly to the portal", async () => {
    mocks.requireVerified.mockResolvedValue({ ...coach, coachVerified: true });

    await expect(VerifyEmailPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/coach");
  });

  it("keeps Client sessions in the Client portal", async () => {
    mocks.actor.mockResolvedValue({ ...coach, role: "CLIENT", clientId: coach.userId });

    await expect(VerifyEmailPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/client");
  });
});
