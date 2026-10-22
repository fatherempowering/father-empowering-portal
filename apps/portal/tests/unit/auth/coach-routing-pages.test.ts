import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  clientDetail: vi.fn(() => null),
  dashboard: vi.fn(() => null),
  redirect: vi.fn(),
  registerClientShell: vi.fn(() => null),
  requireVerified: vi.fn(),
  personal: vi.fn(),
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
vi.mock("@/lib/auth/own-client-access", () => ({ getStaffPersonalProfile: mocks.personal }));
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
import PersonalPortalPage from "@/app/(coach)/coach/personal/page";
import { PortalAccessProvider } from "@/components/fe/portal-access-context";
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
    mocks.personal.mockResolvedValue({ actor: coach, profile: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a verified Coach without a personal profile to explicit setup", async () => {
    await expect(
      ClientLayout({ children: React.createElement("p", null, "Client") }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/coach/personal");
  });

  it("routes an unverified Coach to email verification, never legacy MFA", async () => {
    mocks.personal.mockRejectedValue(
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
    expect(mocks.personal).not.toHaveBeenCalled();
    expect(layout.type).toBe(PortalAccessProvider);
    expect(layout.props.isStaff).toBe(false);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders staff personal access without changing the actor role", async () => {
    mocks.personal.mockResolvedValue({ actor: coach, profile: { id: client.clientId, status: "ACTIVE" } });
    const layout = await ClientLayout({ children: React.createElement("p", null, "Client") });
    expect(layout.type).toBe(PortalAccessProvider);
    expect(layout.props.isStaff).toBe(true);
    expect(mocks.personal).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["SUSPENDED", "ARCHIVED"])("does not render a %s personal profile", async (status) => {
    mocks.personal.mockResolvedValue({ actor: coach, profile: { id: client.clientId, status } });
    await expect(ClientLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/coach/personal");
  });

  it("requires login again when staff credentials are invalid", async () => {
    mocks.personal.mockRejectedValue(new M1ContractError("UNAUTHENTICATED", "Invalid session", 401));
    await expect(ClientLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("keeps profile lookup failures closed", async () => {
    mocks.personal.mockRejectedValue(new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unavailable", 503));
    await expect(ClientLayout({ children: null })).rejects.toMatchObject({ status: 503 });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("Staff personal entry is read-only and guarded", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.actor.mockResolvedValue(coach);
    mocks.personal.mockResolvedValue({ actor: coach, profile: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders explicit setup instead of creating anything on GET", async () => {
    const page = await PersonalPortalPage();
    expect(page.props.current).toBe("personal");
    expect(page.props.children.type.name).toBe("PersonalPortalSetup");
    expect(mocks.personal).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("reuses an active own profile", async () => {
    mocks.personal.mockResolvedValue({ actor: coach, profile: { id: client.clientId, status: "ACTIVE" } });
    await expect(PersonalPortalPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/client");
  });
  it("does not offer recreation for a suspended own profile", async () => {
    mocks.personal.mockResolvedValue({ actor: coach, profile: { id: client.clientId, status: "SUSPENDED" } });
    const page = await PersonalPortalPage();
    expect(page.props.children.type).toBe(React.Fragment);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it.each([[null, "/login"], [client, "/client"]])("rejects a non-staff entry before personal lookup", async (actor, destination) => {
    mocks.actor.mockResolvedValue(actor);
    await expect(PersonalPortalPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
    expect(mocks.personal).not.toHaveBeenCalled();
  });
  it("requires the existing Coach verification", async () => {
    mocks.personal.mockRejectedValue(new M1ContractError("FORBIDDEN", "Verification required", 403));
    await expect(PersonalPortalPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
  });
});
