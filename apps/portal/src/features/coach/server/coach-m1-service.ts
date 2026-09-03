import type {
  CoachActor,
  CoachCreateClientRequest,
  CreateClientResult,
  InvitationMutationRequest,
  InvitationMutationResult,
} from "../model";
import type { CoachM1Dependencies } from "./ports";

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
    const result = await this.dependencies.createInvitedClientAtomically({ actor, request });
    return { ...result, deliveryQueued: true };
  }

  async resendInvitation(
    actor: CoachActor,
    request: InvitationMutationRequest,
  ): Promise<InvitationMutationResult> {
    assertCoachAal2(actor);

    const result = await this.dependencies.resendInvitationAtomically({
      actor,
      clientId: request.clientId,
      clientMutationId: request.clientMutationId,
    });
    return { ...result, deliveryQueued: true };
  }

  async revokeInvitation(
    actor: CoachActor,
    request: InvitationMutationRequest,
  ): Promise<InvitationMutationResult> {
    assertCoachAal2(actor);

    const result = await this.dependencies.revokeInvitationAtomically({
      actor,
      clientId: request.clientId,
      clientMutationId: request.clientMutationId,
    });
    return { ...result, deliveryQueued: false };
  }
}
