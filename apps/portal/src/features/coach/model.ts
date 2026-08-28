import type {
  ActorContext,
  ClientSummary,
  CreateClientRequest,
  InvitationSummary,
} from "@/lib/contracts/m1";

export type CoachActor = ActorContext;
export type CoachClientSummary = ClientSummary;
export type CoachInvitationSummary = InvitationSummary;
export type CoachCreateClientRequest = CreateClientRequest & {
  clientMutationId: string;
};

/**
 * Stable response returned by the M1 create-client command. The persistence
 * adapter owns the transaction; the service owns the command semantics.
 */
export interface CreateClientResult {
  client: CoachClientSummary;
  invitation: CoachInvitationSummary;
  deliveryQueued: boolean;
}

export interface InvitationMutationResult {
  client: CoachClientSummary;
  invitation: CoachInvitationSummary;
  deliveryQueued: boolean;
}

export interface InvitationMutationRequest {
  clientId: string;
  clientMutationId: string;
}

export interface CreateClientFormValues {
  firstName: string;
  lastName: string;
  email: string;
  locale: "fr" | "en";
  timezone: string;
}

export interface CoachDashboardClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  locale: "fr" | "en";
  timezone: string;
  status: ClientSummary["status"];
  invitation: CoachInvitationSummary | null;
}

export interface CoachDashboardResponse {
  clients: CoachDashboardClient[];
}
