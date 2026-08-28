import { describe, expect, it } from "vitest";

import type {
  CoachActor,
  CoachClientSummary,
  CoachCreateClientRequest,
  CoachInvitationSummary,
} from "../model";
import { CoachM1Service } from "../server/coach-m1-service";
import type {
  CoachAuditRecord,
  CoachM1Dependencies,
  CoachM1Transaction,
  CoachMutationEnvelope,
} from "../server/ports";

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

class FakeTransaction implements CoachM1Transaction {
  readonly audits: CoachAuditRecord[] = [];
  readonly deliveryKinds: Array<"INITIAL" | "RESEND"> = [];
  creates = 0;
  resends = 0;
  revokes = 0;

  async createClientAndPrimaryAssignment() {
    this.creates += 1;
    return client;
  }

  async issueInvitation() {
    return invitation;
  }

  async resendCurrentInvitation() {
    this.resends += 1;
    return { client, invitation: { ...invitation, status: "SENT" as const } };
  }

  async revokeCurrentInvitation() {
    this.revokes += 1;
    return { client, invitation: { ...invitation, status: "REVOKED" as const } };
  }

  async appendAudit(record: CoachAuditRecord) {
    this.audits.push(record);
  }

  async enqueueInvitationDelivery(input: { kind: "INITIAL" | "RESEND" }) {
    this.deliveryKinds.push(input.kind);
  }
}

class FakeDependencies implements CoachM1Dependencies {
  readonly transaction = new FakeTransaction();
  readonly envelopes: CoachMutationEnvelope[] = [];
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

  async runIdempotentMutation<T>(
    envelope: CoachMutationEnvelope,
    work: (transaction: CoachM1Transaction) => Promise<T>,
  ): Promise<T> {
    this.envelopes.push(envelope);
    const existing = this.results.get(envelope.clientMutationId);
    if (existing) {
      if (existing.fingerprint !== envelope.requestFingerprint) throw new Error("DUPLICATE");
      return existing.value as T;
    }
    const value = await work(this.transaction);
    this.results.set(envelope.clientMutationId, {
      fingerprint: envelope.requestFingerprint,
      value,
    });
    return value;
  }
}

describe("CoachM1Service", () => {
  it("crée le client, son assignation primaire, son invitation et les audits", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const result = await service.createClient(actor, request);

    expect(result).toEqual({ client, invitation, deliveryQueued: true });
    expect(dependencies.transaction.creates).toBe(1);
    expect(dependencies.transaction.deliveryKinds).toEqual(["INITIAL"]);
    expect(dependencies.transaction.audits.map((audit) => audit.action)).toEqual([
      "CLIENT_CREATED",
      "CLIENT_INVITATION_SENT",
    ]);
    expect(dependencies.envelopes[0]).toMatchObject({
      actor,
      clientMutationId: request.clientMutationId,
      action: "CLIENT_CREATED",
    });
  });

  it("retourne le résultat initial pour une répétition idempotente", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    const first = await service.createClient(actor, request);
    const second = await service.createClient(actor, request);

    expect(second).toEqual(first);
    expect(dependencies.transaction.creates).toBe(1);
    expect(dependencies.transaction.audits).toHaveLength(2);
    expect(dependencies.transaction.deliveryKinds).toEqual(["INITIAL"]);
  });

  it("refuse le même identifiant de mutation pour un contenu différent", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);
    await service.createClient(actor, request);

    await expect(
      service.createClient(actor, { ...request, email: "different@example.test" }),
    ).rejects.toThrow("DUPLICATE");
    expect(dependencies.transaction.creates).toBe(1);
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
    expect(dependencies.transaction.resends).toBe(1);
    expect(dependencies.transaction.deliveryKinds).toEqual(["RESEND"]);
    expect(dependencies.transaction.audits.at(-1)?.action).toBe(
      "CLIENT_INVITATION_RESENT",
    );
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
    expect(dependencies.transaction.revokes).toBe(1);
    expect(dependencies.transaction.deliveryKinds).toEqual([]);
  });

  it("refuse un Client même si un adaptateur est mal branché", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    await expect(
      service.listClients({ ...actor, role: "CLIENT", clientId: client.id }),
    ).rejects.toThrow("FORBIDDEN");
    expect(dependencies.envelopes).toHaveLength(0);
  });

  it("refuse un Coach sans assurance MFA AAL2", async () => {
    const dependencies = new FakeDependencies();
    const service = new CoachM1Service(dependencies);

    await expect(service.createClient({ ...actor, aal: "aal1" }, request)).rejects.toThrow(
      "MFA_REQUIRED",
    );
    expect(dependencies.transaction.creates).toBe(0);
  });
});

