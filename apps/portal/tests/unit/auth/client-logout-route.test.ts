import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOutClientSession: vi.fn() }));

vi.mock("@/lib/auth/client-session", () => auth);

import { POST as logoutClient } from "@/app/api/v1/auth/client-logout/route";

const appUrl = "https://app.fatherempowering.com";
const logoutUrl = `${appUrl}/api/v1/auth/client-logout`;

describe("Client logout route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    auth.signOutClientSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects cross-origin logout without touching the session", async () => {
    const response = await logoutClient(new Request(logoutUrl, {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(auth.signOutClientSession).not.toHaveBeenCalled();
  });

  it("returns a no-store success after local logout", async () => {
    const response = await logoutClient(new Request(logoutUrl, {
      method: "POST",
      headers: { origin: appUrl },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({
      data: { signedOut: true, redirectTo: "/client-login" },
    });
    expect(auth.signOutClientSession).toHaveBeenCalledOnce();
  });

  it("does not expose unexpected logout failures", async () => {
    auth.signOutClientSession.mockRejectedValue(new Error("raw provider failure"));

    const response = await logoutClient(new Request(logoutUrl, {
      method: "POST",
      headers: { origin: appUrl },
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        message: "Service temporarily unavailable.",
      },
    });
  });
});
