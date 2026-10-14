import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), verified: vi.fn(), redirect: vi.fn(), library: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ getServerActor: mocks.actor, requireCoachVerified: mocks.verified }));
vi.mock("@/features/training/coach/program-builder", () => ({ ProgramBuilder: mocks.library }));
vi.mock("next/navigation", () => ({ redirect: (destination: string) => { mocks.redirect(destination); throw new Error("NEXT_REDIRECT"); } }));
import CoachProgramsPage from "@/app/(coach)/coach/programs/page";

describe("Program builder page guard", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("React", React); mocks.actor.mockResolvedValue({ role: "COACH" }); });
  afterEach(() => vi.unstubAllGlobals());
  it("renders only after the existing Coach verification guard", async () => {
    const page = await CoachProgramsPage();
    expect(page.type).toBe(mocks.library); expect(mocks.verified).toHaveBeenCalledOnce();
  });
  it.each([[null, "/login"], [{ role: "CLIENT" }, "/client"]])("redirects without rendering for actor %j", async (actor, path) => {
    mocks.actor.mockResolvedValue(actor);
    await expect(CoachProgramsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(path); expect(mocks.verified).not.toHaveBeenCalled();
  });
  it.each([["FORBIDDEN", 403, "/verify-email"], ["UNAUTHENTICATED", 401, "/login"]] as const)("handles %s without a legacy MFA detour", async (code, status, path) => {
    mocks.verified.mockRejectedValue(new M1ContractError(code, "Denied", status));
    await expect(CoachProgramsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(path);
  });
  it("does not render a permissive fallback during an authentication outage", async () => {
    mocks.verified.mockRejectedValue(new M1ContractError("TEMPORARILY_UNAVAILABLE", "Unavailable", 503));
    await expect(CoachProgramsPage()).rejects.toThrow("Unavailable");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
