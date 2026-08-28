import type {
  CoachActor,
  CoachClientSummary,
  CoachCreateClientRequest,
  CoachDashboardResponse,
  CoachInvitationSummary,
} from "../model";

export interface CoachM1Dependencies {
  listAssignedClients(actor: CoachActor): Promise<CoachDashboardResponse>;

  /** One PostgreSQL RPC owns client + primary assignment + invitation + audit + outbox. */
  createInvitedClientAtomically(input: {
    actor: CoachActor;
    request: CoachCreateClientRequest;
  }): Promise<{ client: CoachClientSummary; invitation: CoachInvitationSummary }>;

  resendInvitationAtomically(input: {
    actor: CoachActor;
    clientId: string;
    clientMutationId: string;
  }): Promise<{ client: CoachClientSummary; invitation: CoachInvitationSummary }>;

  revokeInvitationAtomically(input: {
    actor: CoachActor;
    clientId: string;
    clientMutationId: string;
  }): Promise<{ client: CoachClientSummary; invitation: CoachInvitationSummary }>;
}
