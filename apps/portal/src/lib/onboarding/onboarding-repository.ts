import "server-only";

import { requireCoachVerified, requireRole } from "@/lib/auth/actor";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import {
  EMPTY_ONBOARDING_RESPONSES,
  ONBOARDING_KIND,
  ONBOARDING_SCHEMA_VERSION,
  coachOnboardingSnapshotSchema,
  onboardingSnapshotSchema,
  type CoachOnboardingSnapshot,
  type OnboardingResponses,
  type OnboardingSnapshot,
  type SaveOnboardingRequest,
  type SubmitOnboardingRequest,
} from "@/lib/contracts/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type IntakeRow = {
  kind: string;
  schema_version: number;
  status: string;
  responses: unknown;
  row_version: number;
  updated_at: string;
  submitted_at: string | null;
};

function snapshotFromRow(row: IntakeRow): OnboardingSnapshot {
  return onboardingSnapshotSchema.parse({
    kind: row.kind,
    schemaVersion: row.schema_version,
    status: row.status,
    version: row.row_version,
    responses: row.responses,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  });
}

function mapOnboardingRpcError(error: { message: string } | null): M1ContractError {
  const message = error?.message ?? "";
  if (message.includes("FE_UNAUTHENTICATED")) {
    return new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  }
  if (message.includes("FE_FORBIDDEN")) {
    return new M1ContractError("FORBIDDEN", "Operation is not permitted", 403);
  }
  if (message.includes("FE_INVALID_ONBOARDING_INTAKE") || message.includes("FE_INVALID_INPUT")) {
    return new M1ContractError("VALIDATION_FAILED", "Invalid onboarding intake", 400);
  }
  if (message.includes("FE_ONBOARDING_INTAKE_INCOMPLETE")) {
    return new M1ContractError(
      "VALIDATION_FAILED",
      "Complete the required onboarding fields before submission",
      400,
    );
  }
  if (message.includes("FE_VERSION_CONFLICT")) {
    return new M1ContractError("VERSION_CONFLICT", "The intake changed; reload it", 409);
  }
  if (message.includes("FE_IDEMPOTENCY_CONFLICT")) {
    return new M1ContractError("DUPLICATE", "Mutation identifier already used", 409);
  }
  if (message.includes("FE_ONBOARDING_INTAKE_SUBMITTED")) {
    return new M1ContractError("INVALID_STATE", "The onboarding intake is already submitted", 409);
  }
  return new M1ContractError(
    "TEMPORARILY_UNAVAILABLE",
    "Onboarding intake is temporarily unavailable",
    503,
  );
}

export async function getOwnOnboardingIntake(): Promise<OnboardingSnapshot> {
  const actor = await requireRole("CLIENT");
  if (!actor.clientId) {
    throw new M1ContractError("FORBIDDEN", "Client identity is not linked", 403);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("client_onboarding_intakes")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", actor.clientId)
    .maybeSingle();
  if (error) throw mapOnboardingRpcError(error);
  if (data) return snapshotFromRow(data as IntakeRow);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("email, first_name, last_name")
    .eq("organization_id", actor.organizationId)
    .eq("id", actor.clientId)
    .eq("auth_user_id", actor.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (clientError) throw mapOnboardingRpcError(clientError);
  if (!client) throw new M1ContractError("NOT_FOUND", "Client profile not found", 404);

  const responses = structuredClone(EMPTY_ONBOARDING_RESPONSES) as OnboardingResponses;
  responses.fullName = `${client.first_name} ${client.last_name}`.trim();
  responses.email = client.email;
  return {
    kind: ONBOARDING_KIND,
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    status: "NOT_STARTED",
    version: 0,
    responses,
    updatedAt: null,
    submittedAt: null,
  };
}

export async function saveOwnOnboardingIntake(
  input: SaveOnboardingRequest,
): Promise<OnboardingSnapshot> {
  await requireRole("CLIENT");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_own_onboarding_intake", {
    p_responses: input.responses,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapOnboardingRpcError(error);
  return onboardingSnapshotSchema.parse(data);
}

export async function submitOwnOnboardingIntake(
  input: SubmitOnboardingRequest,
): Promise<OnboardingSnapshot> {
  await requireRole("CLIENT");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_own_onboarding_intake", {
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapOnboardingRpcError(error);
  return onboardingSnapshotSchema.parse(data);
}

export async function getCoachClientOnboardingIntake(clientIdInput: string) {
  const actor = await requireCoachVerified();
  const clientId = uuidSchema.parse(clientIdInput);
  const supabase = await createServerSupabaseClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, email, first_name, last_name, locale, time_zone")
    .eq("id", clientId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (clientError) throw mapOnboardingRpcError(clientError);
  if (!client) throw new M1ContractError("NOT_FOUND", "Client not found", 404);

  const { data: intake, error: intakeError } = await supabase
    .from("client_onboarding_intakes")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", clientId)
    .eq("status", "SUBMITTED")
    .maybeSingle();
  if (intakeError) throw mapOnboardingRpcError(intakeError);

  const coachSnapshot: CoachOnboardingSnapshot = intake
    ? coachOnboardingSnapshotSchema.parse({
        ...snapshotFromRow(intake as IntakeRow),
        status: "SUBMITTED",
      })
    : {
        kind: ONBOARDING_KIND,
        schemaVersion: ONBOARDING_SCHEMA_VERSION,
        status: "NOT_SUBMITTED",
        version: 0,
        responses: null,
        updatedAt: null,
        submittedAt: null,
      };

  return {
    client: {
      id: client.id,
      displayName: `${client.first_name} ${client.last_name}`,
      email: client.email,
      locale: client.locale,
      timezone: client.time_zone,
    },
    intake: coachSnapshot,
  };
}
