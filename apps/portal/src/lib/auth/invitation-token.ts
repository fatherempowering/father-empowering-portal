import { createHash } from "node:crypto";

import { M1ContractError } from "@/lib/contracts/m1";

export function hashInvitationToken(opaqueToken: string): string {
  if (opaqueToken.length < 32 || opaqueToken.length > 512) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid invitation token", 400);
  }
  return createHash("sha256").update(opaqueToken, "utf8").digest("hex");
}
