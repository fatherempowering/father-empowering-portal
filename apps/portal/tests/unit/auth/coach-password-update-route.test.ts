import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateStaffPassword: vi.fn(),
  cookieValue: "signed-recovery-grant",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: mocks.cookieValue }),
  }),
}));
vi.mock("@/lib/auth/staff-password-recovery", () => ({
  updateStaffPassword: mocks.updateStaffPassword,
}));

import { POST as updatePassword } from "@/app/api/v1/auth/coach-password/update/route";

const appUrl = "https://preview.example.test";
const endpoint = `${appUrl}/api/v1/auth/coach-password/update`;

describe("Coach password update boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    mocks.updateStaffPassword.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires canonical same-origin and forwards only the recovery grant and password", async () => {
    const denied = await updatePassword(new Request(endpoint, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ password: "A-new-password-for-Max!123" }),
    }));
    expect(denied.status).toBe(403);
    expect(mocks.updateStaffPassword).not.toHaveBeenCalled();

    const response = await updatePassword(new Request(endpoint, {
      method: "POST",
      headers: { origin: appUrl, "content-type": "application/json" },
      body: JSON.stringify({ password: "A-new-password-for-Max!123" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateStaffPassword).toHaveBeenCalledWith(
      mocks.cookieValue,
      "A-new-password-for-Max!123",
    );
    expect(await response.json()).toEqual({
      data: { updated: true, redirectTo: "/login?password=updated" },
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("fe-staff-recovery=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
  });
});
