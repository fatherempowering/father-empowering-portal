import { M1ContractError, type M1Role, type ServerActor } from "@/lib/contracts/m1";

export function assertActorRole(actor: ServerActor, ...allowedRoles: M1Role[]): ServerActor {
  if (!allowedRoles.includes(actor.role)) {
    throw new M1ContractError("FORBIDDEN", "Role is not permitted", 403);
  }
  return actor;
}

export function assertCoachAal2(actor: ServerActor): ServerActor {
  assertActorRole(actor, "ADMIN", "COACH");
  if (actor.aal !== "aal2") {
    throw new M1ContractError("FORBIDDEN", "MFA assurance level 2 is required", 403);
  }
  return actor;
}

export function assertMfaEnrollmentAllowed(
  actor: ServerActor,
  hasVerifiedFactor: boolean,
): void {
  assertActorRole(actor, "ADMIN", "COACH");
  if (hasVerifiedFactor && actor.aal !== "aal2") {
    throw new M1ContractError(
      "FORBIDDEN",
      "An existing MFA factor must be verified before another can be enrolled",
      403,
    );
  }
}
