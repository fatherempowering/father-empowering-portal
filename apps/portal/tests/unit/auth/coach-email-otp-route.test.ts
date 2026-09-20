import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requestCoachEmailOtp: vi.fn(),
  verifyCoachEmailOtp: vi.fn(),
}));

vi.mock("@/lib/auth/coach-email-verification", () => auth);

import { POST as requestOtp } from "@/app/api/v1/auth/coach-email-otp/request/route";
import { POST as verifyOtp } from "@/app/api/v1/auth/coach-email-otp/verify/route";
import { M1ContractError } from "@/lib/contracts/m1";

const appUrl = "https://app.fatherempowering.com";

describe("Coach email OTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    auth.requestCoachEmailOtp.mockResolvedValue({
      emailHint: "ma***@f***.com",
      retryAfterSeconds: 60,
    });
    auth.verifyCoachEmailOtp.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request without the canonical same-origin signal", async () => {
    const response = await requestOtp(new Request(
      `${appUrl}/api/v1/auth/coach-email-otp/request`,
      { method: "POST" },
    ));

    expect(response.status).toBe(403);
    expect(auth.requestCoachEmailOtp).not.toHaveBeenCalled();
  });

  it("returns the exact accepted contract with no-store protections", async () => {
    const response = await requestOtp(new Request(
      `${appUrl}/api/v1/auth/coach-email-otp/request`,
      { method: "POST", headers: { origin: appUrl } },
    ));

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({
      data: {
        accepted: true,
        emailHint: "ma***@f***.com",
        retryAfterSeconds: 60,
      },
    });
    expect(auth.requestCoachEmailOtp).toHaveBeenCalledWith(expect.any(String));
  });

  it("verifies only the canonical {code} body", async () => {
    const response = await verifyOtp(new Request(
      `${appUrl}/api/v1/auth/coach-email-otp/verify`,
      {
        method: "POST",
        headers: { origin: appUrl, "content-type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      data: { verified: true, redirectTo: "/coach" },
    });
    expect(auth.verifyCoachEmailOtp).toHaveBeenCalledWith(
      "123456",
      expect.any(String),
    );
  });

  it("returns only the safe verification denial", async () => {
    auth.verifyCoachEmailOtp.mockRejectedValue(
      new M1ContractError("UNAUTHENTICATED", "Invalid or expired code", 401),
    );
    const response = await verifyOtp(new Request(
      `${appUrl}/api/v1/auth/coach-email-otp/verify`,
      {
        method: "POST",
        headers: { origin: appUrl, "content-type": "application/json" },
        body: JSON.stringify({ code: "000000" }),
      },
    ));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Invalid or expired code" },
    });
  });
});
