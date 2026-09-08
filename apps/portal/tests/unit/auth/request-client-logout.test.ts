import { describe, expect, it, vi } from "vitest";

import { requestClientLogout } from "@/features/client/auth/request-client-logout";

describe("Client logout browser boundary", () => {
  it("leaves the private portal after any HTTP response, including a failure response", async () => {
    const leavePortal = vi.fn();
    const transport = vi.fn().mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    const responseReceived = await requestClientLogout(leavePortal, transport);

    expect(responseReceived).toBe(true);
    expect(leavePortal).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      "/api/v1/auth/client-logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the portal visible only when no HTTP response is received", async () => {
    const leavePortal = vi.fn();
    const transport = vi.fn().mockRejectedValue(new TypeError("network unavailable"));

    const responseReceived = await requestClientLogout(leavePortal, transport);

    expect(responseReceived).toBe(false);
    expect(leavePortal).not.toHaveBeenCalled();
  });
});
