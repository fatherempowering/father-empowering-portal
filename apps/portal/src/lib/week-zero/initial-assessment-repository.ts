import "server-only";

import { requireCoachVerified, requireRole } from "@/lib/auth/actor";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import {
  EMPTY_INITIAL_ASSESSMENT_RESPONSES,
  INITIAL_ASSESSMENT_KIND,
  INITIAL_ASSESSMENT_SCHEMA_VERSION,
  coachInitialAssessmentSnapshotSchema,
  initialAssessmentSnapshotSchema,
  type CoachInitialAssessmentSnapshot,
  type InitialAssessmentSnapshot,
  type SaveInitialAssessmentRequest,
  type SubmitInitialAssessmentRequest,
} from "@/lib/contracts/week-zero";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const EMPTY_SNAPSHOT: InitialAssessmentSnapshot = {
  kind: INITIAL_ASSESSMENT_KIND,
  schemaVersion: INITIAL_ASSESSMENT_SCHEMA_VERSION,
  status: "NOT_STARTED",
  version: 0,
  responses: EMPTY_INITIAL_ASSESSMENT_RESPONSES,
  updatedAt: null,
  submittedAt: null,
};

type AssessmentRow = {
  kind: string;
  schema_version: number;
  status: string;
  responses: unknown;
  row_version: number;
  updated_at: string;
  submitted_at: string | null;
};

function snapshotFromRow(row: AssessmentRow): InitialAssessmentSnapshot {
  return initialAssessmentSnapshotSchema.parse({
    kind: row.kind,
    schemaVersion: row.schema_version,
    status: row.status,
    version: row.row_version,
    responses: row.responses,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  });
}

function mapAssessmentRpcError(error: { message: string } | null): M1ContractError {
  const message = error?.message ?? "";
  if (message.includes("FE_UNAUTHENTICATED")) {
    return new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  }
  if (message.includes("FE_FORBIDDEN")) {
    return new M1ContractError("FORBIDDEN", "Operation is not permitted", 403);
  }
  if (message.includes("FE_INVALID_INITIAL_ASSESSMENT") || message.includes("FE_INVALID_INPUT")) {
    return new M1ContractError("VALIDATION_FAILED", "Invalid initial assessment", 400);
  }
  if (message.includes("FE_INITIAL_ASSESSMENT_INCOMPLETE")) {
    return new M1ContractError(
      "VALIDATION_FAILED",
      "Complete the required initial assessment fields before submission",
      400,
    );
  }
  if (message.includes("FE_VERSION_CONFLICT")) {
    return new M1ContractError("VERSION_CONFLICT", "The assessment changed; reload it", 409);
  }
  if (message.includes("FE_IDEMPOTENCY_CONFLICT")) {
    return new M1ContractError("DUPLICATE", "Mutation identifier already used", 409);
  }
  if (message.includes("FE_INITIAL_ASSESSMENT_SUBMITTED")) {
    return new M1ContractError("INVALID_STATE", "The assessment is already submitted", 409);
  }
  return new M1ContractError(
    "TEMPORARILY_UNAVAILABLE",
    "Initial assessment is temporarily unavailable",
    503,
  );
}

export async function getOwnInitialAssessment(): Promise<InitialAssessmentSnapshot> {
  const actor = await requireRole("CLIENT");
  if (!actor.clientId) {
    throw new M1ContractError("FORBIDDEN", "Client identity is not linked", 403);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("week_zero_assessments")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", actor.clientId)
    .maybeSingle();

  if (error) throw mapAssessmentRpcError(error);
  return data ? snapshotFromRow(data as AssessmentRow) : structuredClone(EMPTY_SNAPSHOT);
}

export async function saveOwnInitialAssessment(
  input: SaveInitialAssessmentRequest,
): Promise<InitialAssessmentSnapshot> {
  await requireRole("CLIENT");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_own_initial_assessment", {
    p_responses: input.responses,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapAssessmentRpcError(error);
  return initialAssessmentSnapshotSchema.parse(data);
}

export async function submitOwnInitialAssessment(
  input: SubmitInitialAssessmentRequest,
): Promise<InitialAssessmentSnapshot> {
  await requireRole("CLIENT");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_own_initial_assessment", {
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapAssessmentRpcError(error);
  return initialAssessmentSnapshotSchema.parse(data);
}

export async function getCoachClientInitialAssessment(clientIdInput: string) {
  const actor = await requireCoachVerified();
  const clientId = uuidSchema.parse(clientIdInput);
  const supabase = await createServerSupabaseClient();

  // The Client RLS policy is the anti-enumeration boundary: a non-assigned
  // Coach cannot distinguish another Client from an unknown UUID.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, email, first_name, last_name, locale, time_zone")
    .eq("id", clientId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (clientError) throw mapAssessmentRpcError(clientError);
  if (!client) throw new M1ContractError("NOT_FOUND", "Client not found", 404);

  const { data: assessment, error: assessmentError } = await supabase
    .from("week_zero_assessments")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", clientId)
    .eq("status", "SUBMITTED")
    .maybeSingle();
  if (assessmentError) throw mapAssessmentRpcError(assessmentError);

  const coachSnapshot: CoachInitialAssessmentSnapshot = assessment
    ? coachInitialAssessmentSnapshotSchema.parse({
        ...snapshotFromRow(assessment as AssessmentRow),
        status: "SUBMITTED",
      })
    : {
        kind: INITIAL_ASSESSMENT_KIND,
        schemaVersion: INITIAL_ASSESSMENT_SCHEMA_VERSION,
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
    assessment: coachSnapshot,
  };
}
