import { describe, expect, it } from "vitest";

import {
  createClientInputSchema,
  m1RoleSchema,
  serverActorSchema,
} from "@/lib/contracts/m1";

describe("M1 contracts", () => {
  it("accepts only the three contractual roles", () => {
    expect(m1RoleSchema.parse("ADMIN")).toBe("ADMIN");
    expect(m1RoleSchema.parse("COACH")).toBe("COACH");
    expect(m1RoleSchema.parse("CLIENT")).toBe("CLIENT");
    expect(() => m1RoleSchema.parse("OWNER")).toThrow();
  });

  it("normalizes a client email and supplies M1 defaults", () => {
    expect(
      createClientInputSchema.parse({
        idempotencyKey: "75bbed40-1487-40a8-8b75-2982dc63538f",
        email: "  CLIENT@EXAMPLE.COM ",
        firstName: "Marie",
        lastName: "Tremblay",
      }),
    ).toEqual({
      idempotencyKey: "75bbed40-1487-40a8-8b75-2982dc63538f",
      email: "client@example.com",
      firstName: "Marie",
      lastName: "Tremblay",
      locale: "fr-CA",
      timeZone: "America/Montreal",
    });
  });

  it("requires an authenticated organization-scoped actor", () => {
    expect(() =>
      serverActorSchema.parse({
        userId: "not-a-uuid",
        organizationId: crypto.randomUUID(),
        membershipId: crypto.randomUUID(),
        clientId: null,
        role: "COACH",
        aal: "aal2",
      }),
    ).toThrow();
  });
});
