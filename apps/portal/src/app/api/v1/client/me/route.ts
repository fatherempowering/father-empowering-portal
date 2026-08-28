import { createGetOwnClientHandler } from "@/features/client/http/dashboard-handler";
import { getClientDashboardDependencies } from "@/features/client/server/runtime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return createGetOwnClientHandler(getClientDashboardDependencies())();
}
