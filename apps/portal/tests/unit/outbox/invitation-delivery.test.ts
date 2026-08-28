import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  invitationUpdate: vi.fn(),
  createUser: vi.fn(),
  assertIdentitySafe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: mocks.sendMail, close: mocks.close }),
  },
}));
vi.mock("@/lib/env", () => ({
  getInvitationDeliveryEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    INVITATION_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
    INVITATION_EMAIL_FROM: "portal@example.test",
    M1_EMAIL_TRANSPORT: "smtp",
    M1_TEST_SMTP_HOST: "127.0.0.1",
    M1_TEST_SMTP_PORT: 54325,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    auth: { admin: { createUser: mocks.createUser } },
    rpc: mocks.assertIdentitySafe,
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { first_name: "Client", locale: "fr-CA" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "client_invitations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "71000000-0000-4000-8000-000000000001",
                  client_id: "41000000-0000-4000-8000-000000000001",
                  email: "client@example.test",
                  status: "PENDING",
                  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
          update: mocks.invitationUpdate,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { deliverClientInvitation } from "@/lib/outbox/invitation-delivery";
import type { OutboxEvent } from "@/lib/outbox/worker";

const event: OutboxEvent = {
  id: "81000000-0000-4000-8000-000000000001",
  organization_id: "21000000-0000-4000-8000-000000000001",
  event_type: "ClientInvitationCreated",
  schema_version: 1,
  aggregate_type: "client",
  aggregate_id: "41000000-0000-4000-8000-000000000001",
  actor_user_id: "11000000-0000-4000-8000-000000000001",
  payload: { invitationId: "71000000-0000-4000-8000-000000000001" },
  attempts: 1,
};

describe("M1 invitation delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createUser.mockResolvedValue({ error: null });
    mocks.assertIdentitySafe.mockResolvedValue({ error: null });
    mocks.invitationUpdate.mockReturnValue({
      eq: () => ({
        in: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: { id: "71000000-0000-4000-8000-000000000001" },
              error: null,
            }),
          }),
        }),
      }),
    });
  });

  it("keeps the invitation pending when the email provider fails", async () => {
    mocks.sendMail.mockRejectedValue(new Error("SMTP unavailable"));

    await expect(deliverClientInvitation(event)).rejects.toThrow("SMTP unavailable");
    expect(mocks.invitationUpdate).not.toHaveBeenCalled();
  });

  it("marks the invitation sent only after provider acceptance", async () => {
    mocks.sendMail.mockResolvedValue({ messageId: "mail-1" });

    await deliverClientInvitation(event);

    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENT", token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
  });

  it("does not deliver to an Auth identity already assigned to another role", async () => {
    mocks.assertIdentitySafe.mockResolvedValue({
      error: { message: "FE_EMAIL_IDENTITY_CONFLICT" },
    });

    await expect(deliverClientInvitation(event)).rejects.toThrow(
      "Invitation identity is already assigned",
    );
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.invitationUpdate).not.toHaveBeenCalled();
  });
});
