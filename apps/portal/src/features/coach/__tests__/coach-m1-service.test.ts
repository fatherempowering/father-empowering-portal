import { describe, expect, it } from "vitest";

import type {
  CoachActor,
  CoachClientSummary,
  CoachCreateClientRequest,
  CoachInvitationSummary,
} from "../model";
import { CoachM1Service } from "../server/coach-m1-service";
import type { CoachM1Dependencies } from "../server/ports";

const actor: CoachActor = {
  userId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  membershipId: "30000000-0000-4000-8000-000000000001",
  role: "COACH",
  aal: "aal2",
  clientId: null,
};

const request: CoachCreateClientRequest = {
  firstName: "Ariane",
  lastName: "Tremblay",
  email: "ariane@example.test",
  locale: "fr",
  timezone: "America/Toronto",
  clientMutationId: "mutation-create-0001",
};

const client: CoachClientSummary = {
  id: "40000000-0000-4000-8000-000000000001",
  organizationId: actor.organizationId,
  authUserId: null,
  firstName: request.firstName,
  lastName: request.lastName,
  preferredName: null,
  displayName: `${request.firstName} ${request.lastName}`,
  email: request.email,
  locale: request.locale,
  timezone: request.timezone,
  plannedStartDate: null,
  status: "INVITED",
  primaryCoachUserId: actor.userId,
  createdAt: "2026-08-27T12:00:00.000Z",
};

const invitation: CoachInvitationSummary = {
  id: "50000000-0000-4000-8000-000000000001",
  clientId: client.id,
  email: client.email,
  status: "PENDING",
  expiresAt: "2026-08-29T12:00:00.000Z",
  sentAt: null,
  acceptedAt: null,
};

class FakeDependencies implements CoachM1Dependencies {
  creates = 0;
  resends = 0;
  revokes = 0;
  private readonly results = new Map<string, { fingerprint: string; value: unknown }>();

  async listAssignedClients() {
    return {
      clients: [
        {
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          locale: client.locale,
          timezone: client.timezone,
          status: client.status,
          invitation,
        },
      ],
    };
  }

  async createInvitedClientAtomically({
    request: input,
  }: {
    actor: CoachActor;
    request: CoachCreateClientRequest;
  }) {
    const fingerprint = JSON.stringify(input);
    const existing = this.results.get(input.clientMutationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("DUPLICATE");
      return existing.value as { client: CoachClientSummary; invitation: CoachInvitationSummary };
    }
    this.creates += 1;
    const value = { client, invitation };
    this.results.set(input.clientMutationId, { fingerprint, value });
    return value;
  }

  async resendInvitationAtomically() {
    this.resends += 1;
    return { client, invitation: { ...invitation, status: "SENT" as const } };
  }

  async revokeInvitationAtomically() {
    this.revokes += 1;
    return { client, invitation: { ...invitation, status: "REVOKED" as const } };
  }
}

describe("CoachM1Service", () => {
  it("délègue la création complète à la commande PostgreSQL atomique", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const result = await service.createClient(actor, request);

    expect(result).toEqual({ client, invitation, deliveryQueued: true });
    expect(dependencies.creates).toBe(1);
  });

  it("retourne le résultat initial pour une répétition idempotente", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const first = await service.createClient(actor, request);
    const second = await service.createClient(actor, request);

    expect(second).toEqual(first);
    expect(dependencies.creates).toBe(1);
  });

  it("refuse le même identifiant de mutation pour un contenu différent", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);
    await service.createClient(actor, request);

    await expect(
      service.createClient(actor, { ...request, email: "different@example.test" }),
    ).rejects.toThrow("DUPLICATE");
    expect(dependencies.creates).toBe(1);
  });

  it("renvoie une invitation et inscrit un effet d’email dans l’outbox", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const result = await service.resendInvitation(actor, {
      clientId: client.id,
      clientMutationId: "mutation-resend-0001",
    });

    expect(result.invitation.status).toBe("SENT");
    expect(result.deliveryQueued).toBe(true);
    expect(dependencies.resends).toBe(1);
  });

  it("révoque sans mettre un email en attente", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const result = await service.revokeInvitation(actor, {
      clientId: client.id,
      clientMutationId: "mutation-revoke-0001",
    });

    expect(result.invitation.status).toBe("REVOKED");
    expect(result.deliveryQueued).toBe(false);
    expect(dependencies.revokes).toBe(1);
  });

  it("refuse un Client même si un adaptateur est mal branché", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    await expect(
      service.listClients({ ...actor, role: "CLIENT", clientId: client.id }),
    ).rejects.toThrow("FORBIDDEN");
    expect(dependencies.creates).toBe(0);
  });

  it("refuse un Coach sans assurance MFA AAL2", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    await expect(service.createClient({ ...actor, aal: "aal1" }, request)).rejects.toThrow(
      "MFA_REQUIRED",
    );
    expect(dependencies.creates).toBe(0);
  });
});
