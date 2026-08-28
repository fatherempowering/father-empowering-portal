import { CoachM1Service } from "./coach-m1-service";
import type { CoachM1Dependencies } from "./ports";

type RuntimeGlobal = typeof globalThis & {
  __fatherEmpoweringCoachM1Dependencies?: CoachM1Dependencies;
};

/**
 * Platform integration seam. Agent 1/root integration must install the
 * PostgreSQL-backed adapter during server bootstrap. It intentionally lives in
 * the Coach feature so no shared platform helper is authored on this branch.
 */
export function installCoachM1Dependencies(dependencies: CoachM1Dependencies): void {
  (globalThis as RuntimeGlobal).__fatherEmpoweringCoachM1Dependencies = dependencies;
}

export function getCoachM1Service(): CoachM1Service {
  const dependencies = (globalThis as RuntimeGlobal).__fatherEmpoweringCoachM1Dependencies;
  if (!dependencies) {
    throw new Error("COACH_M1_RUNTIME_NOT_CONFIGURED");
  }
  return new CoachM1Service(dependencies);
}
