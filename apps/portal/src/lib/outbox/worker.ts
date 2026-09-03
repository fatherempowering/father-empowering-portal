import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type OutboxEvent = {
  id: string;
  organization_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;
export type OutboxHandlers = Readonly<Record<string, OutboxHandler>>;

export const OUTBOX_FAILURE_REASON_CODES = [
  "EVENT_VALIDATION_FAILED",
  "INVITATION_LOOKUP_FAILED",
  "CLIENT_LOOKUP_FAILED",
  "AUTH_PROVISIONING_FAILED",
  "IDENTITY_VALIDATION_FAILED",
  "EMAIL_DELIVERY_FAILED",
  "INVITATION_STATE_TRANSITION_FAILED",
  "OUTBOX_HANDLER_NOT_REGISTERED",
  "OUTBOX_HANDLER_FAILED",
  "OUTBOX_FINALIZATION_FAILED",
] as const;

export type OutboxFailureReasonCode = (typeof OUTBOX_FAILURE_REASON_CODES)[number];

export class OutboxStepFailure extends Error {
  readonly reasonCode: OutboxFailureReasonCode;

  constructor(reasonCode: OutboxFailureReasonCode, cause?: unknown) {
    super(`Outbox step failed: ${reasonCode}`, { cause });
    this.name = "OutboxStepFailure";
    this.reasonCode = reasonCode;
  }
}

type OutboxOutcome =
  | { id: string; status: "PROCESSED" | "SKIPPED" }
  | { id: string; status: "FAILED"; reason_code: OutboxFailureReasonCode };

const MAX_ATTEMPTS = 8;

function nextAttempt(attempts: number) {
  const seconds = Math.min(3600, 2 ** Math.min(attempts, 11));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Processes the transactional PostgreSQL outbox without another broker.
 * Handlers MUST use event.id as their provider idempotency key.
 */
export async function processOutboxBatch(handlers: OutboxHandlers, limit = 25) {
  const admin = createAdminSupabaseClient();
  const workerId = randomUUID();
  const { data: candidates, error } = await admin.rpc("claim_outbox_events", {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_worker_id: workerId,
  });
  if (error) throw error;

  const outcomes: OutboxOutcome[] = [];
  for (const candidate of (candidates ?? []) as OutboxEvent[]) {
    try {
      const handler = handlers[candidate.event_type];
      if (!handler) throw new OutboxStepFailure("OUTBOX_HANDLER_NOT_REGISTERED");
      try {
        await handler(candidate);
      } catch (handlerError) {
        if (handlerError instanceof OutboxStepFailure) throw handlerError;
        throw new OutboxStepFailure("OUTBOX_HANDLER_FAILED", handlerError);
      }
      try {
        const { data: completed, error: completeError } = await admin.rpc("complete_outbox_event", {
          p_event_id: candidate.id,
          p_worker_id: workerId,
        });
        if (completeError || !completed) {
          throw completeError ?? new Error("Outbox claim was lost");
        }
      } catch (completeError) {
        throw new OutboxStepFailure("OUTBOX_FINALIZATION_FAILED", completeError);
      }
      outcomes.push({ id: candidate.id, status: "PROCESSED" });
    } catch (processingError) {
      const attempts = candidate.attempts;
      const message = processingError instanceof Error ? processingError.message : "Unknown outbox error";
      const reasonCode =
        processingError instanceof OutboxStepFailure
          ? processingError.reasonCode
          : "OUTBOX_HANDLER_FAILED";
      const { error: failureError } = await admin.rpc("fail_outbox_event", {
        p_event_id: candidate.id,
        p_worker_id: workerId,
        p_error: message.slice(0, 1000),
        p_retry_at: nextAttempt(attempts),
        p_terminal: attempts >= MAX_ATTEMPTS,
      });
      if (failureError) throw failureError;
      outcomes.push({ id: candidate.id, status: "FAILED", reason_code: reasonCode });
    }
  }
  return outcomes;
}
