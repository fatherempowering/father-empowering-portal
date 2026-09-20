import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/coach-sign-in", () => ({
  signInCoachWithPassword: mocks.signIn,
}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    mocks.redirect(destination);
    throw new Error("NEXT_REDIRECT");
  },
}));

import { signInCoachAction } from "@/app/login/actions";
import { M1ContractError } from "@/lib/contracts/m1";

function credentials() {
  const form = new FormData();
  form.set("email", "coach@example.test");
  form.set("password", "correct horse battery staple");
  return form;
}

describe("Coach login action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses the destination selected by the authenticated server flow", async () => {
    mocks.signIn.mockResolvedValue({ destination: "/verify-email" });

    await expect(signInCoachAction(credentials())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
  });

  it("keeps invalid credentials and non-Coach accounts indistinguishable", async () => {
    mocks.signIn.mockRejectedValue(
      new M1ContractError("FORBIDDEN", "Coach access required", 403),
    );

    await expect(signInCoachAction(credentials())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?error=invalid");
  });

  it("does not mislabel a temporary outage as a bad password", async () => {
    mocks.signIn.mockRejectedValue(
      new M1ContractError(
        "TEMPORARILY_UNAVAILABLE",
        "Unable to send code",
        503,
      ),
    );

    await expect(signInCoachAction(credentials())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?error=unavailable");
  });
});
