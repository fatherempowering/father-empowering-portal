import { loadClientDashboard } from "../dashboard/load-client-dashboard";
import type { ClientDashboardDependencies } from "../dashboard/contracts";
import { jsonResponse, safeHttpError } from "./json";

export function createGetOwnClientHandler(dependencies: ClientDashboardDependencies) {
  return async function getOwnClient(): Promise<Response> {
    try {
      const client = await loadClientDashboard(dependencies);
      return jsonResponse({ client });
    } catch (error) {
      return safeHttpError(error);
    }
  };
}
