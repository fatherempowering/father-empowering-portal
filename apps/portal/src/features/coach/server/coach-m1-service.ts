import type {
  CoachActor,
  CoachCreateClientRequest,
  CreateClientResult,
  InvitationMutationRequest,
  InvitationMutationResult,
} from "../model";
import type { CoachM1Dependencies } from "./ports";

function actorUserId(actor: CoachActor): string {
  return actor.userId;
}

function actorOrganizationId(actor: CoachActor): string {
  return actor.organizationId;
}

function stableFingerprint(parts: ReadonlyArray<string>): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

function assertCoachAal2(actor: CoachActor): void {
  if (actor.role !== "ADMIN" && actor.role !== "COACH") {
    throw new Error("FORBIDDEN");
  }
  if (actor.aal !== "aal2") {
    throw new Error("MFA_REQUIRED");
  }
}

export class CoachM1Service {
  constructor(private readonly dependencies: CoachM1Dependencies) {}

  async listClients(actor: CoachActor) {
    assertCoachAal2(actor);
    return this.dependencies.listAssignedClients(actor);
  }

  async createClient(
    actor: CoachActor,
    request: CoachCreateClientRequest,
  ): Promise<CreateClientResult> {
    assertCoachAal2(actor);
    const requestFingerprint = stableFingerprint([
      "create-client-v1",
      request.firstName,
      request.lastName,
      request.email.toLowerCase(),
      request.locale,
      request.timezone,
    ]);

    return this.dependencies.runIdempotentMutation(
      {
        actor,
        clientMutationId: request.clientMutationId,
        action: "CLIENT_CREATED",
        requestFingerprint,
      },
      async (transaction) => {
        const client = await transaction.createClientAndPrimaryAssignment({
          actor,
          request,
        });
        const invitation = await transaction.issueInvitation({
          actor,
          clientId: client.id,
          email: request.email,
          locale: request.locale,
        });

        await transaction.appendAudit({
          action: "CLIENT_CREATED",
          entityType: "CLIENT",
          entityId: client.id,
          organizationId: actorOrganizationId(actor),
          actorUserId: actorUserId(actor),
          targetClientId: client.id,
          metadata: { primaryCoachAssigned: true },
        });
        await transaction.appendAudit({
          action: "CLIENT_INVITATION_SENT",
          entityType: "CLIENT_INVITATION",
          entityId: invitation.id,
          organizationId: actorOrganizationId(actor),
          actorUserId: actorUserId(actor),
          targetClientId: client.id,
        });
        await transaction.enqueueInvitationDelivery({
          actor,
          clientId: client.id,
          invitationId: invitation.id,
          kind: "INITIAL",
        });

        return { client, invitation, deliveryQueued: true };
      },
    );
  }

  async resendInvitation(
    actor: CoachActor,
    request: InvitationMutationRequest,
  ): Promise<InvitationMutationResult> {
    assertCoachAal2(actor);

    return this.dependencies.runIdempotentMutation(
      {
        actor,
        clientMutationId: request.clientMutationId,
        action: "CLIENT_INVITATION_RESENT",
        requestFingerprint: stableFingerprint([
          "resend-invitation-v1",
          request.clientId,
        ]),
      },
      async (transaction) => {
        const result = await transaction.resendCurrentInvitation({
          actor,
          clientId: request.clientId,
        });
        await transaction.appendAudit({
          action: "CLIENT_INVITATION_RESENT",
          entityType: "CLIENT_INVITATION",
          entityId: result.invitation.id,
          organizationId: actorOrganizationId(actor),
          actorUserId: actorUserId(actor),
          targetClientId: request.clientId,
        });
        await transaction.enqueueInvitationDelivery({
          actor,
          clientId: request.clientId,
          invitationId: result.invitation.id,
          kind: "RESEND",
        });

        return { ...result, deliveryQueued: true };
      },
    );
  }

  async revokeInvitation(
    actor: CoachActor,
    request: InvitationMutationRequest,
  ): Promise<InvitationMutationResult> {
    assertCoachAal2(actor);

    return this.dependencies.runIdempotentMutation(
      {
        actor,
        clientMutationId: request.clientMutationId,
        action: "CLIENT_INVITATION_REVOKED",
        requestFingerprint: stableFingerprint([
          "revoke-invitation-v1",
          request.clientId,
        ]),
      },
      async (transaction) => {
        const result = await transaction.revokeCurrentInvitation({
          actor,
          clientId: request.clientId,
        });
        await transaction.appendAudit({
          action: "CLIENT_INVITATION_REVOKED",
          entityType: "CLIENT_INVITATION",
          entityId: result.invitation.id,
          organizationId: actorOrganizationId(actor),
          actorUserId: actorUserId(actor),
          targetClientId: request.clientId,
        });

        return { ...result, deliveryQueued: false };
      },
    );
  }
}

