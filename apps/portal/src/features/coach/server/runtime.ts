import { CoachM1Service } from "./coach-m1-service";
import type { CoachM1Dependencies } from "./ports";
import { coachM1Dependencies } from "@/lib/composition/coach-m1";

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
  const dependencies =
    (globalThis as RuntimeGlobal).__fatherEmpoweringCoachM1Dependencies ?? coachM1Dependencies;
  return new CoachM1Service(dependencies);
}
