import { describe, expect, it, vi } from "vitest";

import type { ClientDashboardDependencies } from "./contracts";
import {
  ClientDashboardUnavailableError,
  loadClientDashboard,
} from "./load-client-dashboard";

const actor = {
  userId: "auth-client-a",
  organizationId: "organization-1",
  clientId: "client-a",
  role: "CLIENT" as const,
};

function dependencies(): ClientDashboardDependencies {
  return {
    session: { requireClientActor: vi.fn().mockResolvedValue(actor) },
    dashboards: {
      findForActor: vi.fn().mockResolvedValue({
        clientId: actor.clientId,
        displayName: "Client A",
        status: "ACTIVE",
        locale: "fr-CA",
        timezone: "America/Montreal",
      }),
    },
  };
}

describe("loadClientDashboard", () => {
  it("loads only the client bound to the authenticated CLIENT actor", async () => {
    const deps = dependencies();
    const dashboard = await loadClientDashboard(deps);

    expect(deps.dashboards.findForActor).toHaveBeenCalledWith(actor);
    expect(dashboard.clientId).toBe(actor.clientId);
  });

  it("rejects an adapter result belonging to another client", async () => {
    const deps = dependencies();
    vi.mocked(deps.dashboards.findForActor).mockResolvedValue({
      clientId: "client-b",
      displayName: "Client B",
      status: "ACTIVE",
      locale: "fr-CA",
      timezone: "America/Montreal",
    });

    await expect(loadClientDashboard(deps)).rejects.toBeInstanceOf(
      ClientDashboardUnavailableError,
    );
  });
});
