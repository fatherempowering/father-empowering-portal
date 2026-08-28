import { describe, expect, it } from "vitest";

import {
  assertActorRole,
  assertCoachAal2,
  assertMfaEnrollmentAllowed,
} from "@/lib/auth/authorization";
import type { ServerActor } from "@/lib/contracts/m1";

function actor(role: ServerActor["role"], aal: ServerActor["aal"]): ServerActor {
  return {
    userId: "079501b0-75a0-49cf-b6be-67782d7fb981",
    organizationId: "78395d53-cdf3-4f22-a3e1-b398516a1c1e",
    membershipId: "af317f10-cd1a-4e0c-84e3-f009658f80dd",
    clientId: role === "CLIENT" ? "13e83e40-8869-4584-b7c0-450d5f3d1d25" : null,
    role,
    aal,
  };
}

describe("M1 authorization guards", () => {
  it("permits an allowed role", () => {
    expect(assertActorRole(actor("CLIENT", "aal1"), "CLIENT").role).toBe("CLIENT");
  });

  it("rejects a role outside the allow-list", () => {
    expect(() => assertActorRole(actor("CLIENT", "aal1"), "ADMIN", "COACH")).toThrow(
      "Role is not permitted",
    );
  });

  it("requires aal2 for Coach and Admin", () => {
    expect(assertCoachAal2(actor("COACH", "aal2")).aal).toBe("aal2");
    expect(() => assertCoachAal2(actor("ADMIN", "aal1"))).toThrow(
      "MFA assurance level 2 is required",
    );
  });

  it("never treats a Client at aal2 as a Coach", () => {
    expect(() => assertCoachAal2(actor("CLIENT", "aal2"))).toThrow("Role is not permitted");
  });

  it("requires the existing MFA factor before enrolling another", () => {
    expect(() => assertMfaEnrollmentAllowed(actor("COACH", "aal1"), false)).not.toThrow();
    expect(() => assertMfaEnrollmentAllowed(actor("COACH", "aal2"), true)).not.toThrow();
    expect(() => assertMfaEnrollmentAllowed(actor("COACH", "aal1"), true)).toThrow(
      "existing MFA factor",
    );
  });
});
