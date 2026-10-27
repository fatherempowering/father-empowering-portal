import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { requireCoachVerified } from "@/lib/auth/actor";
import { requireOwnClientAccess } from "@/lib/auth/own-client-access";
import {
  EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES,
  WEEK_ZERO_ACQUISITION_KIND,
  WEEK_ZERO_ACQUISITION_SCHEMA_VERSION,
  coachWeekZeroAcquisitionSchema,
  photoSlotSchema,
  weekZeroAcquisitionResponsesSchema,
  weekZeroAcquisitionSnapshotSchema,
  type CoachWeekZeroAcquisition,
  type SaveWeekZeroAcquisitionRequest,
  type SubmitWeekZeroAcquisitionRequest,
  type WeekZeroAcquisitionSnapshot,
  type WeekZeroPhotoMutation,
} from "@/lib/contracts/week-zero-acquisition";
import { M1ContractError, uuidSchema } from "@/lib/contracts/m1";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deriveWeekZeroAcquisition } from "@/lib/week-zero/concept2";

const WEEK_ZERO_PHOTO_BUCKET = "week-zero-photos";

type AcquisitionRow = {
  kind: string;
  schema_version: number;
  status: string;
  responses: unknown;
  row_version: number;
  updated_at: string;
  submitted_at: string | null;
};

type StoredSnapshot = {
  kind: unknown;
  schemaVersion: unknown;
  status: unknown;
  version: unknown;
  responses: unknown;
  updatedAt: unknown;
  submittedAt: unknown;
};

const EMPTY_SNAPSHOT: WeekZeroAcquisitionSnapshot = {
  kind: WEEK_ZERO_ACQUISITION_KIND,
  schemaVersion: WEEK_ZERO_ACQUISITION_SCHEMA_VERSION,
  status: "NOT_STARTED",
  version: 0,
  responses: EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES,
  derived: { cardio: null },
  updatedAt: null,
  submittedAt: null,
};

function hydrateStoredSnapshot(snapshot: StoredSnapshot): WeekZeroAcquisitionSnapshot {
  return weekZeroAcquisitionSnapshotSchema.parse({
    ...snapshot,
    derived: deriveWeekZeroAcquisition(weekZeroAcquisitionResponsesSchema.parse(snapshot.responses)),
  });
}

function snapshotFromRow(row: AcquisitionRow): WeekZeroAcquisitionSnapshot {
  return hydrateStoredSnapshot({
    kind: row.kind,
    schemaVersion: row.schema_version,
    status: row.status,
    version: row.row_version,
    responses: row.responses,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  });
}

function mapAcquisitionError(error: { message: string } | null): M1ContractError {
  const message = error?.message ?? "";
  if (message.includes("FE_UNAUTHENTICATED")) {
    return new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  }
  if (message.includes("FE_FORBIDDEN")) {
    return new M1ContractError("FORBIDDEN", "Operation is not permitted", 403);
  }
  if (message.includes("FE_WEEK_ZERO_PHOTO_NOT_FOUND")) {
    return new M1ContractError("VALIDATION_FAILED", "The progress photo is unavailable", 400);
  }
  if (
    message.includes("FE_INVALID_WEEK_ZERO_ACQUISITION") ||
    message.includes("FE_INVALID_WEEK_ZERO_PHOTO") ||
    message.includes("FE_INVALID_INPUT")
  ) {
    return new M1ContractError("VALIDATION_FAILED", "Invalid Week Zero acquisition", 400);
  }
  if (message.includes("FE_WEEK_ZERO_ACQUISITION_INCOMPLETE")) {
    return new M1ContractError(
      "VALIDATION_FAILED",
      "Complete the required Week Zero fields before submission",
      400,
    );
  }
  if (message.includes("FE_VERSION_CONFLICT")) {
    return new M1ContractError("VERSION_CONFLICT", "Week Zero changed; reload it", 409);
  }
  if (message.includes("FE_IDEMPOTENCY_CONFLICT")) {
    return new M1ContractError("DUPLICATE", "Mutation identifier already used", 409);
  }
  if (message.includes("FE_WEEK_ZERO_ACQUISITION_SUBMITTED")) {
    return new M1ContractError("INVALID_STATE", "Week Zero is already submitted", 409);
  }
  return new M1ContractError("TEMPORARILY_UNAVAILABLE", "Week Zero is unavailable", 503);
}

export async function getOwnWeekZeroAcquisition(): Promise<WeekZeroAcquisitionSnapshot> {
  const actor = await requireOwnClientAccess();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("week_zero_acquisitions")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", actor.ownClientId)
    .maybeSingle();
  if (error) throw mapAcquisitionError(error);
  return data ? snapshotFromRow(data as AcquisitionRow) : structuredClone(EMPTY_SNAPSHOT);
}

export async function saveOwnWeekZeroAcquisition(
  input: SaveWeekZeroAcquisitionRequest,
): Promise<WeekZeroAcquisitionSnapshot> {
  await requireOwnClientAccess();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_own_week_zero_acquisition", {
    p_responses: input.responses,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapAcquisitionError(error);
  return hydrateStoredSnapshot(data as StoredSnapshot);
}

export async function submitOwnWeekZeroAcquisition(
  input: SubmitWeekZeroAcquisitionRequest,
): Promise<WeekZeroAcquisitionSnapshot> {
  await requireOwnClientAccess();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_own_week_zero_acquisition", {
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapAcquisitionError(error);
  return hydrateStoredSnapshot(data as StoredSnapshot);
}

export async function attachOwnWeekZeroPhoto(
  input: WeekZeroPhotoMutation,
): Promise<WeekZeroAcquisitionSnapshot> {
  await requireOwnClientAccess();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("attach_own_week_zero_photo", {
    p_slot: input.slot,
    p_asset_id: input.assetId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.clientMutationId,
  });
  if (error) throw mapAcquisitionError(error);
  return hydrateStoredSnapshot(data as StoredSnapshot);
}

function photoObjectName(
  organizationId: string,
  clientId: string,
  slot: string,
  assetId: string,
) {
  return `${organizationId}/${clientId}/${slot}/${assetId}`;
}

export async function uploadOwnWeekZeroPhoto(input: {
  mutation: WeekZeroPhotoMutation;
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<WeekZeroAcquisitionSnapshot> {
  const actor = await requireOwnClientAccess();
  const objectName = photoObjectName(
    actor.organizationId,
    actor.ownClientId,
    input.mutation.slot,
    input.mutation.assetId.toLowerCase(),
  );
  const admin = createAdminSupabaseClient();
  const bucket = admin.storage.from(WEEK_ZERO_PHOTO_BUCKET);
  const acquisition = await getOwnWeekZeroAcquisition();
  if (acquisition.status !== "DRAFT") {
    throw new M1ContractError(
      "INVALID_STATE",
      acquisition.status === "SUBMITTED"
        ? "Week Zero is already submitted"
        : "Save the Week Zero draft before adding photos",
      409,
    );
  }
  const existing = await bucket.download(objectName);
  if (existing.data) {
    if (!(await photoMatches(existing.data, input.bytes, input.contentType))) {
      throw new M1ContractError("DUPLICATE", "Photo identifier already used", 409);
    }
    return attachOwnWeekZeroPhoto(input.mutation);
  }

  if (acquisition.version !== input.mutation.expectedVersion) {
    throw new M1ContractError("VERSION_CONFLICT", "Week Zero changed; reload it", 409);
  }

  const { error } = await bucket.upload(objectName, input.bytes, {
      contentType: input.contentType,
      cacheControl: "0",
      upsert: false,
    });
  if (error) {
    const retryExisting = await bucket.download(objectName);
    if (
      !retryExisting.data ||
      !(await photoMatches(retryExisting.data, input.bytes, input.contentType))
    ) {
      throw mapAcquisitionError(error);
    }
  }
  return attachOwnWeekZeroPhoto(input.mutation);
}

async function photoMatches(
  existing: Blob,
  incoming: Uint8Array,
  contentType: string,
): Promise<boolean> {
  if (existing.type.toLowerCase() !== contentType || existing.size !== incoming.byteLength) {
    return false;
  }
  const existingDigest = createHash("sha256")
    .update(new Uint8Array(await existing.arrayBuffer()))
    .digest();
  const incomingDigest = createHash("sha256").update(incoming).digest();
  return timingSafeEqual(existingDigest, incomingDigest);
}

async function downloadPhoto(objectName: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.storage.from(WEEK_ZERO_PHOTO_BUCKET).download(objectName);
  if (error || !data) {
    throw new M1ContractError("NOT_FOUND", "Progress photo not found", 404);
  }
  return data;
}

export async function getOwnWeekZeroPhoto(slotInput: string, assetIdInput: string) {
  const slot = photoSlotSchema.parse(slotInput);
  const assetId = uuidSchema.parse(assetIdInput).toLowerCase();
  const actor = await requireOwnClientAccess();
  const acquisition = await getOwnWeekZeroAcquisition();
  if (acquisition.responses.photos[slot]?.toLowerCase() !== assetId) {
    throw new M1ContractError("NOT_FOUND", "Progress photo not found", 404);
  }
  return downloadPhoto(photoObjectName(actor.organizationId, actor.ownClientId, slot, assetId));
}

export async function getCoachClientWeekZeroAcquisition(
  clientIdInput: string,
): Promise<CoachWeekZeroAcquisition> {
  const actor = await requireCoachVerified();
  const clientId = uuidSchema.parse(clientIdInput);
  const supabase = await createServerSupabaseClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (clientError) throw mapAcquisitionError(clientError);
  if (!client) throw new M1ContractError("NOT_FOUND", "Client not found", 404);

  const { data, error } = await supabase
    .from("week_zero_acquisitions")
    .select("kind, schema_version, status, responses, row_version, updated_at, submitted_at")
    .eq("organization_id", actor.organizationId)
    .eq("client_id", clientId)
    .eq("status", "SUBMITTED")
    .maybeSingle();
  if (error) throw mapAcquisitionError(error);
  if (!data) {
    return coachWeekZeroAcquisitionSchema.parse({
      kind: WEEK_ZERO_ACQUISITION_KIND,
      schemaVersion: WEEK_ZERO_ACQUISITION_SCHEMA_VERSION,
      status: "NOT_SUBMITTED",
      version: 0,
      responses: null,
      derived: null,
      updatedAt: null,
      submittedAt: null,
    });
  }

  const snapshot = snapshotFromRow(data as AcquisitionRow);
  return coachWeekZeroAcquisitionSchema.parse({ ...snapshot, status: "SUBMITTED" });
}

export async function getCoachClientWeekZeroPhoto(
  clientIdInput: string,
  slotInput: string,
  assetIdInput: string,
) {
  const actor = await requireCoachVerified();
  const clientId = uuidSchema.parse(clientIdInput);
  const slot = photoSlotSchema.parse(slotInput);
  const assetId = uuidSchema.parse(assetIdInput).toLowerCase();
  const acquisition = await getCoachClientWeekZeroAcquisition(clientId);
  if (
    acquisition.status !== "SUBMITTED" ||
    acquisition.responses?.photos[slot]?.toLowerCase() !== assetId
  ) {
    throw new M1ContractError("NOT_FOUND", "Progress photo not found", 404);
  }
  return downloadPhoto(photoObjectName(actor.organizationId, clientId, slot, assetId));
}
