import { ClientActivationWorkflow } from "../activation/client-activation-workflow";
import type { ClientActivationDependencies } from "../activation/contracts";
import type { ClientDashboardDependencies } from "../dashboard/contracts";

export type ClientM1Dependencies = Readonly<{
  activation: ClientActivationDependencies;
  dashboard: ClientDashboardDependencies;
}>;

type RuntimeGlobal = typeof globalThis & {
  __fatherEmpoweringClientM1Dependencies?: ClientM1Dependencies;
};

/**
 * M1 integration seam. The platform composition root installs PostgreSQL,
 * Supabase Auth, rate-limit and audit adapters without leaking those concerns
 * into the Client feature domain.
 */
export function installClientM1Dependencies(dependencies: ClientM1Dependencies): void {
  (globalThis as RuntimeGlobal).__fatherEmpoweringClientM1Dependencies = dependencies;
}

export function getClientActivationWorkflow(): ClientActivationWorkflow {
  return new ClientActivationWorkflow(getDependencies().activation);
}

export function getClientDashboardDependencies(): ClientDashboardDependencies {
  return getDependencies().dashboard;
}

function getDependencies(): ClientM1Dependencies {
  const dependencies = (globalThis as RuntimeGlobal).__fatherEmpoweringClientM1Dependencies;
  if (!dependencies) {
    throw new Error("CLIENT_M1_RUNTIME_NOT_CONFIGURED");
  }
  return dependencies;
}
