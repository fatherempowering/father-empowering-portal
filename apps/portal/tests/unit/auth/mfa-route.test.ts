import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ verifyTotpFactor: vi.fn() }));

vi.mock("@/lib/auth/mfa", () => auth);

import { POST as verifyMfa } from "@/app/api/v1/auth/mfa/verify/route";

const url = "https://app.fatherempowering.com/api/v1/auth/mfa/verify";

describe("MFA verification route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.verifyTotpFactor.mockResolvedValue(undefined);
  });

  it("rejects an oversized chunked-style body before invoking Auth", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.fatherempowering.com",
      },
      body: JSON.stringify({
        factorId: "11000000-0000-4000-8000-000000000001",
        code: "123456",
        padding: "x".repeat(4_096),
      }),
    });

    expect(request.headers.get("content-length")).toBeNull();
    const response = await verifyMfa(request);

    expect(response.status).toBe(400);
    expect(auth.verifyTotpFactor).not.toHaveBeenCalled();
  });
});
