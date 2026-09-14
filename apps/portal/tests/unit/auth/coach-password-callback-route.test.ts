import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  issueGrant: vi.fn(),
}));

vi.mock("@/lib/auth/staff-password-recovery", () => ({
  exchangeStaffPasswordRecoveryCode: mocks.exchange,
}));
vi.mock("@/lib/auth/staff-password-recovery-grant", () => ({
  issueStaffPasswordRecoveryGrant: mocks.issueGrant,
  STAFF_PASSWORD_RECOVERY_COOKIE: "fe-staff-recovery",
  STAFF_PASSWORD_RECOVERY_MAX_AGE_SECONDS: 600,
}));

import { GET as passwordCallback } from "@/app/auth/callback/route";

const appUrl = "https://preview.example.test";

describe("Coach password recovery callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    mocks.exchange.mockResolvedValue({
      userId: "11000000-0000-4000-8000-000000000001",
      sessionId: "21000000-0000-4000-8000-000000000001",
    });
    mocks.issueGrant.mockReturnValue("signed-recovery-grant");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a short-lived secure HttpOnly grant only after a recovery exchange", async () => {
    const response = await passwordCallback(new Request(
      `${appUrl}/auth/callback?code=pkce-code&next=%2Freset-password`,
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${appUrl}/reset-password`);
    expect(mocks.exchange).toHaveBeenCalledWith("pkce-code");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("fe-staff-recovery=signed-recovery-grant");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
  });

  it("fails closed for a bad purpose or failed exchange", async () => {
    const wrongPurpose = await passwordCallback(new Request(
      `${appUrl}/auth/callback?code=pkce-code&next=%2Fcoach`,
    ));
    expect(wrongPurpose.headers.get("location")).toBe(`${appUrl}/login?error=recovery`);
    expect(mocks.exchange).not.toHaveBeenCalled();

    mocks.exchange.mockRejectedValueOnce(new Error("provider detail"));
    const expired = await passwordCallback(new Request(
      `${appUrl}/auth/callback?code=expired&next=%2Freset-password`,
    ));
    expect(expired.headers.get("location")).toBe(`${appUrl}/login?error=recovery`);
    expect(expired.headers.get("set-cookie")).toBeNull();
  });
});
