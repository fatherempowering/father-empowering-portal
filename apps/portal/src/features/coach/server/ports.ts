import type {
  CoachActor,
  CoachClientSummary,
  CoachCreateClientRequest,
  CoachDashboardResponse,
  CoachInvitationSummary,
} from "../model";

export type CoachM1Action =
  | "CLIENT_CREATED"
  | "CLIENT_INVITATION_SENT"
  | "CLIENT_INVITATION_RESENT"
  | "CLIENT_INVITATION_REVOKED";

export interface CoachMutationEnvelope {
  actor: CoachActor;
  clientMutationId: string;
  action: CoachM1Action;
  requestFingerprint: string;
}

export interface CoachAuditRecord {
  action: CoachM1Action;
  entityType: "CLIENT" | "CLIENT_INVITATION";
  entityId: string;
  organizationId: string;
  actorUserId: string;
  targetClientId: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CoachM1Transaction {
  createClientAndPrimaryAssignment(input: {
    actor: CoachActor;
    request: CoachCreateClientRequest;
  }): Promise<CoachClientSummary>;

  issueInvitation(input: {
    actor: CoachActor;
    clientId: string;
    email: string;
    locale: string;
  }): Promise<CoachInvitationSummary>;

  resendCurrentInvitation(input: {
    actor: CoachActor;
    clientId: string;
  }): Promise<{
    client: CoachClientSummary;
    invitation: CoachInvitationSummary;
  }>;

  revokeCurrentInvitation(input: {
    actor: CoachActor;
    clientId: string;
  }): Promise<{
    client: CoachClientSummary;
    invitation: CoachInvitationSummary;
  }>;

  appendAudit(record: CoachAuditRecord): Promise<void>;

  enqueueInvitationDelivery(input: {
    actor: CoachActor;
    clientId: string;
    invitationId: string;
    kind: "INITIAL" | "RESEND";
  }): Promise<void>;
}

/**
 * Platform-owned adapter contract.
 *
 * `runIdempotentMutation` MUST execute the callback, idempotency record, audit
 * writes and outbox writes in one PostgreSQL transaction. A repeated key with
 * the same fingerprint returns the original result; a repeated key with a
 * different fingerprint fails with DUPLICATE/VALIDATION_FAILED.
 */
export interface CoachM1Dependencies {
  listAssignedClients(actor: CoachActor): Promise<CoachDashboardResponse>;

  runIdempotentMutation<T>(
    envelope: CoachMutationEnvelope,
    work: (transaction: CoachM1Transaction) => Promise<T>,
  ): Promise<T>;
}

