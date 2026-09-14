import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requestStaffPasswordRecovery: vi.fn() }));

vi.mock("@/lib/auth/staff-password-recovery", () => auth);
vi.mock("@/lib/http/public-auth-timing", () => ({
  settlePublicAuthResponse: vi.fn().mockResolvedValue(undefined),
}));

import { POST as requestRecovery } from "@/app/api/v1/auth/coach-password/request/route";

const appUrl = "https://preview.example.test";
const endpoint = `${appUrl}/api/v1/auth/coach-password/request`;

function recoveryRequest(email: unknown, origin = appUrl) {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email }),
  });
}

describe("Coach password recovery request boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    auth.requestStaffPasswordRecovery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the canonical browser origin", async () => {
    const response = await requestRecovery(
      recoveryRequest("max@example.test", "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    expect(auth.requestStaffPasswordRecovery).not.toHaveBeenCalled();
  });

  it("returns the same accepted response for success and provider failure", async () => {
    for (const providerResult of [undefined, new Error("account state")]) {
      if (providerResult) {
        auth.requestStaffPasswordRecovery.mockRejectedValueOnce(providerResult);
      }
      const response = await requestRecovery(recoveryRequest("max@example.test"));
      expect(response.status).toBe(202);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ data: { accepted: true } });
    }
  });
});
