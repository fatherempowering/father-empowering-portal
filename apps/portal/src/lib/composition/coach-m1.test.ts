import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientSummary, InvitationSummary } from "@/lib/contracts/m1";

const repository = vi.hoisted(() => ({
  createInvitedClient: vi.fn(),
  getCoachClientInvitationBundle: vi.fn(),
  listCoachClients: vi.fn(),
  resendClientInvitation: vi.fn(),
  revokeClientInvitation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/clients/m1-repository", () => repository);

import { coachM1Dependencies } from "./coach-m1";

const client: ClientSummary = {
  id: "40000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  authUserId: null,
  firstName: "Ariane",
  lastName: "Tremblay",
  preferredName: null,
  displayName: "Ariane Tremblay",
  email: "ariane@example.test",
  locale: "fr",
  timezone: "America/Montreal",
  plannedStartDate: null,
  status: "INVITED",
  primaryCoachUserId: "10000000-0000-4000-8000-000000000001",
  createdAt: "2026-08-27T12:00:00.000Z",
};

const activeClient: ClientSummary = {
  ...client,
  authUserId: "60000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
};

function invitation(id: string, status: InvitationSummary["status"]): InvitationSummary {
  return {
    id,
    clientId: client.id,
    email: client.email,
    status,
    expiresAt: "2026-08-29T12:00:00.000Z",
    sentAt: status === "SENT" || status === "REVOKED" || status === "ACCEPTED"
      ? "2026-08-27T12:05:00.000Z"
      : null,
    acceptedAt: status === "ACCEPTED" ? "2026-08-27T12:10:00.000Z" : null,
  };
}

describe("Coach M1 invitation replay composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejoue l’ancienne révocation sans retourner l’invitation créée ensuite", async () => {
    const revokedInvitation = invitation(
      "50000000-0000-4000-8000-000000000001",
      "REVOKED",
    );
    const laterInvitation = invitation(
      "50000000-0000-4000-8000-000000000002",
      "ACCEPTED",
    );
    repository.revokeClientInvitation.mockResolvedValue({
      invitationId: revokedInvitation.id,
      status: "REVOKED",
    });
    let storedClient = client;
    repository.getCoachClientInvitationBundle.mockImplementation(
      async ({ invitationId }: { invitationId: string }) => ({
        client: storedClient,
        invitation: invitationId === revokedInvitation.id
          ? revokedInvitation
          : laterInvitation,
      }),
    );

    const request = {
      actor: null as never,
      clientId: client.id,
      clientMutationId: "mutation-revoke-old",
    };
    const first = await coachM1Dependencies.revokeInvitationAtomically(request);
    storedClient = activeClient;
    repository.listCoachClients.mockResolvedValue([{ client, invitation: laterInvitation }]);
    const retryAfterLaterResend = await coachM1Dependencies.revokeInvitationAtomically(request);

    expect(retryAfterLaterResend).toEqual(first);
    expect(retryAfterLaterResend.client).toMatchObject({
      authUserId: null,
      status: "INVITED",
    });
    expect(retryAfterLaterResend.invitation.id).toBe(revokedInvitation.id);
    expect(retryAfterLaterResend.invitation.id).not.toBe(laterInvitation.id);
    expect(repository.getCoachClientInvitationBundle).toHaveBeenLastCalledWith({
      clientId: client.id,
      invitationId: revokedInvitation.id,
    });
    expect(repository.listCoachClients).not.toHaveBeenCalled();
  });

  it("rejoue l’ancien renvoi avec son résultat initial après activation", async () => {
    const resentInvitationId = "50000000-0000-4000-8000-000000000010";
    let storedResentInvitation = invitation(resentInvitationId, "PENDING");
    repository.resendClientInvitation.mockResolvedValue({
      invitationId: resentInvitationId,
      expiresAt: "2026-08-29T12:00:00.000Z",
    });
    let storedClient = client;
    repository.getCoachClientInvitationBundle.mockImplementation(
      async ({ invitationId }: { invitationId: string }) => ({
        client: storedClient,
        invitation: invitationId === resentInvitationId
          ? storedResentInvitation
          : invitation(invitationId, "ACCEPTED"),
      }),
    );

    const request = {
      actor: null as never,
      clientId: client.id,
      clientMutationId: "mutation-resend-old",
    };
    const first = await coachM1Dependencies.resendInvitationAtomically(request);
    storedClient = activeClient;
    storedResentInvitation = invitation(resentInvitationId, "ACCEPTED");
    repository.listCoachClients.mockResolvedValue([{
      client: activeClient,
      invitation: storedResentInvitation,
    }]);
    const retryAfterActivation = await coachM1Dependencies.resendInvitationAtomically(request);

    expect(retryAfterActivation).toEqual(first);
    expect(retryAfterActivation.client).toMatchObject({
      authUserId: null,
      status: "INVITED",
    });
    expect(retryAfterActivation.invitation).toMatchObject({
      id: resentInvitationId,
      status: "PENDING",
      sentAt: null,
      acceptedAt: null,
    });
    expect(repository.getCoachClientInvitationBundle).toHaveBeenLastCalledWith({
      clientId: client.id,
      invitationId: resentInvitationId,
    });
    expect(repository.listCoachClients).not.toHaveBeenCalled();
  });
});
