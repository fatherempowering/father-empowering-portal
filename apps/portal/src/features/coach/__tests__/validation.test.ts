import { describe, expect, it } from "vitest";

import {
  CoachInputError,
  parseCreateClientForm,
  parseInvitationMutation,
} from "../validation";

describe("validation Coach M1", () => {
  it("normalise les noms et le courriel d’une création", () => {
    expect(
      parseCreateClientForm({
        firstName: "  Marie   Ève ",
        lastName: "  Gagnon ",
        email: "  MARIE@example.test ",
        locale: "fr",
        timezone: "America/Toronto",
        clientMutationId: "mutation-0001",
      }),
    ).toEqual({
      firstName: "Marie Ève",
      lastName: "Gagnon",
      email: "marie@example.test",
      locale: "fr",
      timezone: "America/Toronto",
      clientMutationId: "mutation-0001",
    });
  });

  it("retourne tous les champs invalides sans exposer d’exception interne", () => {
    try {
      parseCreateClientForm({
        firstName: "",
        lastName: "",
        email: "not-an-email",
        locale: "fr-CA",
        timezone: "Montreal",
        clientMutationId: "x",
      });
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CoachInputError);
      expect((error as CoachInputError).fields).toEqual({
        firstName: expect.any(String),
        lastName: expect.any(String),
        email: expect.any(String),
        locale: expect.any(String),
        timezone: expect.any(String),
        clientMutationId: expect.any(String),
      });
    }
  });

  it("valide le client ciblé et la clé d’idempotence d’une invitation", () => {
    expect(
      parseInvitationMutation("40000000-0000-4000-8000-000000000001", {
        clientMutationId: "mutation-resend-0001",
      }),
    ).toEqual({
      clientId: "40000000-0000-4000-8000-000000000001",
      clientMutationId: "mutation-resend-0001",
    });
  });

  it("rejette une cible non UUID", () => {
    expect(() =>
      parseInvitationMutation("../../another-client", {
        clientMutationId: "mutation-resend-0001",
      }),
    ).toThrow(CoachInputError);
  });
});

