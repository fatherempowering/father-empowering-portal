import type {
  ClientDashboard,
  ClientDashboardDependencies,
} from "./contracts";

export class ClientDashboardUnavailableError extends Error {
  constructor() {
    super("The client profile is not available.");
    this.name = "ClientDashboardUnavailableError";
  }
}

export async function loadClientDashboard(
  dependencies: ClientDashboardDependencies,
): Promise<ClientDashboard> {
  const actor = await dependencies.session.requireClientActor();
  const dashboard = await dependencies.dashboards.findForActor(actor);

  if (!dashboard || dashboard.clientId !== actor.clientId) {
    throw new ClientDashboardUnavailableError();
  }

  return dashboard;
}
