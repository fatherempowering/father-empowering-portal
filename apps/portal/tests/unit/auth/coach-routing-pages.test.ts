import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  clientDetail: vi.fn(() => null),
  dashboard: vi.fn(() => null),
  redirect: vi.fn(),
  registerClientShell: vi.fn(() => null),
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
vi.mock("@/features/coach/components/coach-dashboard", () => ({
  CoachDashboard: mocks.dashboard,
}));
vi.mock("@/features/coach/components/coach-client-detail", () => ({
  CoachClientDetail: mocks.clientDetail,
}));
vi.mock("@/features/client/pwa/register-client-shell", () => ({
  RegisterClientShell: mocks.registerClientShell,
}));

import CoachPage from "@/app/(coach)/coach/page";
import CoachClientPage from "@/app/(coach)/coach/clients/[clientId]/page";
import ClientLayout from "@/app/(client)/layout";
import { M1ContractError } from "@/lib/contracts/m1";

const coach = {
  userId: "11000000-0000-4000-8000-000000000001",
  organizationId: "21000000-0000-4000-8000-000000000001",
  membershipId: "31000000-0000-4000-8000-000000000001",
  clientId: null,
  role: "COACH",
  aal: "aal1",
};

const client = {
  ...coach,
  clientId: "41000000-0000-4000-8000-000000000001",
  role: "CLIENT",
};

describe("Coach route verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.actor.mockResolvedValue(coach);
    mocks.requireVerified.mockResolvedValue({ ...coach, coachVerified: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the dashboard only after Coach email verification", async () => {
    const page = await CoachPage();

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(mocks.dashboard);
    expect(mocks.requireVerified).toHaveBeenCalledOnce();
  });

  it("sends an unverified Coach to the explicit email-code screen", async () => {
    mocks.requireVerified.mockRejectedValue(
      new M1ContractError(
        "FORBIDDEN",
        "Coach email verification is required",
        403,
      ),
    );

    await expect(CoachPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
  });

  it("keeps Client sessions out of the Coach route", async () => {
    mocks.actor.mockResolvedValue(client);

    await expect(CoachPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/client");
    expect(mocks.requireVerified).not.toHaveBeenCalled();
  });

  it("protects a client dossier before rendering the requested client", async () => {
    const page = await CoachClientPage({
      params: Promise.resolve({ clientId: "client-123" }),
    });

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(mocks.clientDetail);
    expect(page.props).toEqual({ clientId: "client-123" });
    expect(mocks.requireVerified).toHaveBeenCalledOnce();
  });

  it("keeps Client sessions out of Coach client dossiers", async () => {
    mocks.actor.mockResolvedValue(client);

    await expect(
      CoachClientPage({
        params: Promise.resolve({ clientId: "client-123" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/client");
    expect(mocks.requireVerified).not.toHaveBeenCalled();
    expect(mocks.clientDetail).not.toHaveBeenCalled();
  });

  it("sends an unverified Coach away from client dossiers", async () => {
    mocks.requireVerified.mockRejectedValue(
      new M1ContractError(
        "FORBIDDEN",
        "Coach email verification is required",
        403,
      ),
    );

    await expect(
      CoachClientPage({
        params: Promise.resolve({ clientId: "client-123" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
    expect(mocks.clientDetail).not.toHaveBeenCalled();
  });
});

describe("Client layout staff routing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.actor.mockResolvedValue(coach);
    mocks.requireVerified.mockResolvedValue({ ...coach, coachVerified: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a verified Coach back to the Coach portal", async () => {
    await expect(
      ClientLayout({ children: React.createElement("p", null, "Client") }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/coach");
  });

  it("routes an unverified Coach to email verification, never legacy MFA", async () => {
    mocks.requireVerified.mockRejectedValue(
      new M1ContractError(
        "FORBIDDEN",
        "Coach email verification is required",
        403,
      ),
    );

    await expect(
      ClientLayout({ children: React.createElement("p", null, "Client") }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
    expect(mocks.redirect).not.toHaveBeenCalledWith("/mfa");
  });

  it("renders the Client shell for a Client session without Coach verification", async () => {
    mocks.actor.mockResolvedValue(client);
    const child = React.createElement("p", null, "Client");

    const layout = await ClientLayout({ children: child });

    expect(React.isValidElement(layout)).toBe(true);
    expect(mocks.requireVerified).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
