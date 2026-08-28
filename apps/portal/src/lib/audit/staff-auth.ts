import "server-only";

import { randomUUID } from "node:crypto";

import {
  M1ContractError,
  type ServerActor,
  uuidSchema,
} from "@/lib/contracts/m1";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type StaffAuthCommand =
  | { command: "CoachSignedIn" }
  | { command: "CoachMfaVerified"; factorId: string };

/**
 * Auth audits are emitted only by trusted server code after the corresponding
 * Supabase Auth operation succeeds. Browser roles have no generic audit-write
 * RPC, and callers cannot supply arbitrary audit context.
 */
export async function recordStaffAuthAudit(
  actor: ServerActor,
  input: StaffAuthCommand,
): Promise<void> {
  if (actor.role !== "ADMIN" && actor.role !== "COACH") {
    throw new M1ContractError("FORBIDDEN", "Staff audit requires a staff actor", 403);
  }
  if (input.command === "CoachMfaVerified" && actor.aal !== "aal2") {
    throw new M1ContractError("FORBIDDEN", "MFA audit requires assurance level 2", 403);
  }

  const context = input.command === "CoachMfaVerified"
    ? { aal: "aal2", factorId: uuidSchema.parse(input.factorId) }
    : { aal: actor.aal };
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    command: input.command,
    entity_type: "auth_session",
    entity_id: actor.userId,
    result: "SUCCEEDED",
    correlation_id: randomUUID(),
    context,
  });
  if (error) {
    throw new M1ContractError(
      "TEMPORARILY_UNAVAILABLE",
      "Unable to persist authentication audit",
      503,
    );
  }
}
