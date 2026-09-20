import { describe, expect, it, vi } from "vitest";

import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";

describe("Coach logout browser boundary", () => {
  it("leaves the private portal only after a successful logout response", async () => {
    const leavePortal = vi.fn();
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const responseReceived = await requestCoachLogout(leavePortal, transport);

    expect(responseReceived).toBe(true);
    expect(leavePortal).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      "/api/v1/auth/coach-logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not claim logout when the server refuses or fails the request", async () => {
    const leavePortal = vi.fn();
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    const responseReceived = await requestCoachLogout(leavePortal, transport);

    expect(responseReceived).toBe(false);
    expect(leavePortal).not.toHaveBeenCalled();
  });

  it("does not claim logout when no HTTP response is received", async () => {
    const leavePortal = vi.fn();
    const transport = vi.fn().mockRejectedValue(new TypeError("network unavailable"));

    const responseReceived = await requestCoachLogout(leavePortal, transport);

    expect(responseReceived).toBe(false);
    expect(leavePortal).not.toHaveBeenCalled();
  });
});
