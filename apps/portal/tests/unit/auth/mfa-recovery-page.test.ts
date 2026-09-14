import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerActor: vi.fn(),
  listTotpFactors: vi.fn(),
  requireRecoveryGrant: vi.fn(),
  redirect: vi.fn(),
  panel: vi.fn(() => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed-recovery-grant" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    mocks.redirect(destination);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth/actor", () => ({ getServerActor: mocks.getServerActor }));
vi.mock("@/lib/auth/mfa", () => ({ listTotpFactors: mocks.listTotpFactors }));
vi.mock("@/lib/auth/staff-password-recovery", () => ({
  requireStaffPasswordRecoveryGrant: mocks.requireRecoveryGrant,
}));
vi.mock("@/app/mfa/panel", () => ({ MfaPanel: mocks.panel }));

import MfaPage from "@/app/mfa/page";

const staffActor = {
  userId: "11000000-0000-4000-8000-000000000001",
  organizationId: "21000000-0000-4000-8000-000000000001",
  membershipId: "31000000-0000-4000-8000-000000000001",
  clientId: null,
  role: "ADMIN",
  aal: "aal1",
};

describe("MFA recovery destination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.getServerActor.mockResolvedValue(staffActor);
    mocks.listTotpFactors.mockResolvedValue([{ id: "factor", status: "verified" }]);
    mocks.requireRecoveryGrant.mockResolvedValue(staffActor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns to password definition only for a valid recovery grant", async () => {
    const page = await MfaPage({
      searchParams: Promise.resolve({ next: "/reset-password" }),
    });

    expect(page).toBeTruthy();
    expect(mocks.requireRecoveryGrant).toHaveBeenCalledWith("signed-recovery-grant");
    const children = React.Children.toArray(page.props.children);
    const panel = children.at(-1) as React.ReactElement<{
      destination: string;
    }>;
    expect(panel.props.destination).toBe("/reset-password");
  });

  it("redirects an already elevated recovery session to password definition", async () => {
    mocks.getServerActor.mockResolvedValue({ ...staffActor, aal: "aal2" });

    await expect(MfaPage({
      searchParams: Promise.resolve({ next: "/reset-password" }),
    })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/reset-password");
  });

  it("does not honor the recovery destination without a valid grant", async () => {
    mocks.getServerActor.mockResolvedValue({ ...staffActor, aal: "aal2" });
    mocks.requireRecoveryGrant.mockRejectedValue(new Error("invalid"));

    await expect(MfaPage({
      searchParams: Promise.resolve({ next: "/reset-password" }),
    })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/coach");
  });
});
