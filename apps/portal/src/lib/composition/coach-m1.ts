import "server-only";

import { createHash } from "node:crypto";

import type { CoachM1Dependencies } from "@/features/coach/server/ports";
import {
  createInvitedClient,
  getCoachClientInvitationBundle,
  listCoachClients,
  resendClientInvitation,
  revokeClientInvitation,
} from "@/lib/clients/m1-repository";
import { M1ContractError } from "@/lib/contracts/m1";

function mutationUuid(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase();
  }
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function requireBundle(clientId: string) {
  const bundle = (await listCoachClients()).find((item) => item.client.id === clientId);
  if (!bundle?.invitation) {
    throw new M1ContractError("NOT_FOUND", "Client invitation could not be loaded", 404);
  }
  return { client: bundle.client, invitation: bundle.invitation };
}

export const coachM1Dependencies: CoachM1Dependencies = {
  async listAssignedClients() {
    const bundles = await listCoachClients();
    return {
      clients: bundles.map(({ client, invitation }) => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        locale: client.locale,
        timezone: client.timezone,
        status: client.status,
        invitation,
      })),
    };
  },

  async createInvitedClientAtomically({ request }) {
    const created = await createInvitedClient({
      idempotencyKey: mutationUuid(request.clientMutationId),
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
      locale: request.locale === "en" ? "en-CA" : "fr-CA",
      timeZone: request.timezone,
    });
    return requireBundle(created.client.id);
  },

  async resendInvitationAtomically({ clientId, clientMutationId }) {
    const resent = await resendClientInvitation({
      clientId,
      idempotencyKey: mutationUuid(clientMutationId),
    });
    const bundle = await getCoachClientInvitationBundle({
      clientId,
      invitationId: resent.invitationId,
    });
    return {
      ...bundle,
      client: {
        ...bundle.client,
        authUserId: null,
        status: "INVITED" as const,
      },
      invitation: {
        ...bundle.invitation,
        status: "PENDING" as const,
        expiresAt: resent.expiresAt,
        sentAt: null,
        acceptedAt: null,
      },
    };
  },

  async revokeInvitationAtomically({ clientId, clientMutationId }) {
    const revoked = await revokeClientInvitation({
      clientId,
      idempotencyKey: mutationUuid(clientMutationId),
    });
    const bundle = await getCoachClientInvitationBundle({
      clientId,
      invitationId: revoked.invitationId,
    });
    return {
      ...bundle,
      client: {
        ...bundle.client,
        authUserId: null,
        status: "INVITED" as const,
      },
      invitation: {
        ...bundle.invitation,
        status: revoked.status,
      },
    };
  },
};
