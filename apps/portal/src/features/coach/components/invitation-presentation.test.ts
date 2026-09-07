import { describe, expect, it } from "vitest";
import { invitationPresentation } from "./invitation-presentation";
import type { CoachDashboardClient } from "../model";

const now = Date.parse("2026-09-07T12:00:00Z");
const client: CoachDashboardClient = {
  id: "client",
  firstName: "Alex",
  lastName: "Martin",
  email: "alex@example.test",
  locale: "fr",
  timezone: "Asia/Tokyo",
  status: "INVITED",
  invitation: {
    id: "invitation",
    clientId: "client",
    email: "alex@example.test",
    status: "SENT",
    sentAt: "2026-09-06T23:00:00Z",
    acceptedAt: null,
    expiresAt: "2026-09-12T12:00:00Z",
  },
};

describe("invitation presentation", () => {
  it("does not mark an invited client active when only the invitation is accepted", () => {
    expect(
      invitationPresentation(
        {
          ...client,
          invitation: { ...client.invitation!, status: "ACCEPTED" },
        },
        now,
      ).label,
    ).toBe("Activation en attente");
  });
  it("uses the client activation state ahead of old invitation metadata", () => {
    expect(
      invitationPresentation(
        {
          ...client,
          status: "ACTIVE",
          invitation: { ...client.invitation!, status: "EXPIRED" },
        },
        now,
      ).label,
    ).toBe("Actif");
  });
  it("shows the expiry at the exact deadline without changing the persisted status", () => {
    const input = {
      ...client,
      invitation: {
        ...client.invitation!,
        expiresAt: new Date(now).toISOString(),
      },
    };
    expect(invitationPresentation(input, now).label).toBe("Invitation expirée");
    expect(input.invitation.status).toBe("SENT");
  });
  it("retains revoked state after its expiry date", () => {
    expect(
      invitationPresentation(
        {
          ...client,
          invitation: {
            ...client.invitation!,
            status: "REVOKED",
            expiresAt: "2020-01-01T00:00:00Z",
          },
        },
        now,
      ).label,
    ).toBe("Invitation révoquée");
  });
  it("distinguishes pending delivery, missing invitation and suspended account", () => {
    expect(
      invitationPresentation(
        { ...client, invitation: { ...client.invitation!, status: "PENDING" } },
        now,
      ).detail,
    ).toBe("Envoi en préparation");
    expect(
      invitationPresentation({ ...client, invitation: null }, now).detail,
    ).toBe("Invitation indisponible");
    expect(
      invitationPresentation({ ...client, status: "SUSPENDED" }, now).label,
    ).toBe("Suspendu");
  });
  it("formats the invitation date in the client's IANA timezone", () => {
    expect(invitationPresentation(client, now).detail).toContain("7 sept.");
    expect(
      invitationPresentation({ ...client, timezone: "America/Toronto" }, now)
        .detail,
    ).toContain("6 sept.");
  });
});
