import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    redirect(destination);
    throw new Error("NEXT_REDIRECT");
  },
}));

import LegacyMfaPage from "@/app/mfa/page";

describe("legacy MFA route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("never exposes the former authenticator flow", () => {
    expect(() => LegacyMfaPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/verify-email");
  });
});
