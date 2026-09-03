import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import {
  OutboxStepFailure,
  processOutboxBatch,
  type OutboxEvent,
} from "@/lib/outbox/worker";

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

describe("M1 outbox failure diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") return { data: [event], error: null };
      if (name === "fail_outbox_event") return { data: true, error: null };
      if (name === "complete_outbox_event") return { data: true, error: null };
      throw new Error("Unexpected RPC");
    });
  });

  it("returns only an allowlisted reason code for a failed handler", async () => {
    const sensitiveMessage = "SMTP rejected private-client@example.test with secret-token";

    const outcomes = await processOutboxBatch({
      ClientInvitationCreated: async () => {
        throw new OutboxStepFailure("EMAIL_DELIVERY_FAILED", new Error(sensitiveMessage));
      },
    });

    expect(outcomes).toEqual([
      {
        id: event.id,
        status: "FAILED",
        reason_code: "EMAIL_DELIVERY_FAILED",
      },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain(sensitiveMessage);
    expect(JSON.stringify(outcomes)).not.toContain("private-client@example.test");
    expect(JSON.stringify(outcomes)).not.toContain("secret-token");
  });

  it("classifies failure after a successful handler as outbox finalization", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") return { data: [event], error: null };
      if (name === "complete_outbox_event") {
        return { data: false, error: { message: "private database detail" } };
      }
      if (name === "fail_outbox_event") return { data: true, error: null };
      throw new Error("Unexpected RPC");
    });

    const outcomes = await processOutboxBatch({
      ClientInvitationCreated: async () => undefined,
    });

    expect(outcomes).toEqual([
      {
        id: event.id,
        status: "FAILED",
        reason_code: "OUTBOX_FINALIZATION_FAILED",
      },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain("private database detail");
  });
});
