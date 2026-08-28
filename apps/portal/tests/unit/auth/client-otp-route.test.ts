import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requestClientLoginOtp: vi.fn(),
  verifyClientLoginOtp: vi.fn(),
}));

vi.mock("@/lib/auth/client-otp-login", () => auth);

import { POST as requestOtp } from "@/app/api/v1/auth/client-otp/request/route";
import { POST as verifyOtp } from "@/app/api/v1/auth/client-otp/verify/route";

const url = "https://app.fatherempowering.com/api/v1/auth/client-otp";

describe("returning Client OTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requestClientLoginOtp.mockResolvedValue(undefined);
    auth.verifyClientLoginOtp.mockResolvedValue({ role: "CLIENT" });
  });

  it("rejects a mutation without a same-origin browser signal", async () => {
    const response = await requestOtp(new Request(`${url}/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "client@example.test" }),
    }));

    expect(response.status).toBe(403);
    expect(auth.requestClientLoginOtp).not.toHaveBeenCalled();
  });

  it("returns the same accepted envelope after a protected OTP request", async () => {
    const response = await requestOtp(new Request(`${url}/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.fatherempowering.com",
      },
      body: JSON.stringify({ email: "client@example.test" }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { accepted: true } });
    expect(auth.requestClientLoginOtp).toHaveBeenCalledWith(
      "client@example.test",
      expect.any(String),
    );
  });

  it("establishes the Client session only through the verify command", async () => {
    const response = await verifyOtp(new Request(`${url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.fatherempowering.com",
      },
      body: JSON.stringify({ email: "client@example.test", otp: "123456" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { authenticated: true, redirectTo: "/client" },
    });
    expect(auth.verifyClientLoginOtp).toHaveBeenCalledWith(
      "client@example.test",
      "123456",
      expect.any(String),
    );
  });
});
