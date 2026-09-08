import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerActor: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/actor", () => ({ getServerActor: mocks.getServerActor }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    mocks.redirect(destination);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/features/client/auth/client-login-card", () => ({
  ClientLoginCard: () => null,
}));

import ClientLoginPage from "@/app/client-login/page";

describe("Client login page session continuity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.getServerActor.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects an already authenticated Client to the portal", async () => {
    mocks.getServerActor.mockResolvedValue({
      userId: "11000000-0000-4000-8000-000000000001",
      organizationId: "21000000-0000-4000-8000-000000000001",
      membershipId: "31000000-0000-4000-8000-000000000001",
      clientId: "41000000-0000-4000-8000-000000000001",
      role: "CLIENT",
      aal: "aal1",
    });

    await expect(ClientLoginPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/client");
  });

  it("keeps the OTP form for a session without an active Client actor", async () => {
    const page = await ClientLoginPage();

    expect(page).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not alter Coach MFA routing from the Client entry point", async () => {
    mocks.getServerActor.mockResolvedValue({
      userId: "11000000-0000-4000-8000-000000000001",
      organizationId: "21000000-0000-4000-8000-000000000001",
      membershipId: "31000000-0000-4000-8000-000000000001",
      clientId: null,
      role: "COACH",
      aal: "aal2",
    });

    const page = await ClientLoginPage();

    expect(page).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
