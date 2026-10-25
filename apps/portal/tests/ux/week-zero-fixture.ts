// Presentation-only fixture. Never a persistence, Storage or RLS proof.
import {
  EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES, WEEK_ZERO_MOVEMENT_KEYS,
  completeWeekZeroAcquisitionResponsesSchema, saveWeekZeroAcquisitionRequestSchema,
  weekZeroPhotoMutationSchema, type WeekZeroAcquisitionSnapshot,
} from "../../src/lib/contracts/week-zero-acquisition";
import { deriveWeekZeroAcquisition } from "../../src/lib/week-zero/concept2";

const photoIds = ["76000000-0000-4000-8000-000000000001", "76000000-0000-4000-8000-000000000002", "76000000-0000-4000-8000-000000000003"];
const now = () => new Date().toISOString();
export function acquisitionFixture(status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" = "NOT_STARTED"): WeekZeroAcquisitionSnapshot {
  const responses = structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES);
  if (status !== "NOT_STARTED") {
    responses.measurements.bodyWeightLb = status === "DRAFT" ? 207.5 : 198.5;
    responses.measurements.waistIn = status === "DRAFT" ? 39.5 : 37.75;
  }
  if (status === "SUBMITTED") {
    responses.instructionsAccepted = true;
    responses.photos = { front: photoIds[0], side: photoIds[1], back: photoIds[2], notes: "Photos synthétiques de la démo uniquement." };
    for (const key of WEEK_ZERO_MOVEMENT_KEYS) responses.loads[key] = { ...responses.loads[key], status: "NOT_PERFORMED", reason: "Non réalisé — exemple de démonstration." };
    responses.cardio = { ...responses.cardio, status: "NOT_PERFORMED", reason: "Concept2 non disponible — exemple de démonstration." };
    responses.mobility = { painSquat: "NOT_PERFORMED", painHinge: "NOT_PERFORMED", painPush: "NOT_PERFORMED", painPull: "NOT_PERFORMED", painCardio: "NOT_PERFORMED", limitedMovement: "N.A.", comfortableMovement: "N.A.", tightArea: "N.A." };
  }
  return { kind: "WEEK_ZERO_ACQUISITION", schemaVersion: 1, status, version: status === "NOT_STARTED" ? 0 : status === "DRAFT" ? 2 : 3, responses, derived: { cardio: null }, updatedAt: status === "NOT_STARTED" ? null : now(), submittedAt: status === "SUBMITTED" ? now() : null };
}

export function createAcquisitionFixture() {
  let snapshot: WeekZeroAcquisitionSnapshot | null = null;
  let conflict = false;
  let failedId: string | null = null;
  let photoRejected = false;
  const receipts = new Map<string, WeekZeroAcquisitionSnapshot>();
  const uploaded = new Set<string>(photoIds);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const error = (code: string, status: number) => reply({ error: { code } }, status);
  return async (url: string, init: RequestInit | undefined, scenario: string): Promise<Response | null> => {
    const parsedUrl = new URL(url, "http://127.0.0.1:3016");
    const path = parsedUrl.pathname;
    if (!path.includes("/week-zero/acquisition") && !path.endsWith("/client/week-zero/photos")) return null;
    const state = scenario.replace(/^assessment-/, "acquisition-");
    if (state === "acquisition-session-expired") return error("UNAUTHENTICATED", 401);
    if (!snapshot) snapshot = acquisitionFixture(state === "acquisition-draft" ? "DRAFT"
      : (scenario === "acquisition-submitted" || scenario === "program-published") ? "SUBMITTED" : "NOT_STARTED");
    if (snapshot.status === "NOT_STARTED" && ["acquisition-ready-to-submit", "acquisition-submit-error"].includes(scenario)) {
      snapshot = { ...acquisitionFixture("SUBMITTED"), status: "DRAFT", submittedAt: null };
    }
    if (!init?.method || init.method === "GET") {
      if (path.endsWith("/photos")) {
        const id = parsedUrl.searchParams.get("assetId");
        if (!id || !uploaded.has(id)) return error("NOT_FOUND", 404);
        const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), c => c.charCodeAt(0));
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      }
      if (state === "acquisition-load-error") return error("TEMPORARILY_UNAVAILABLE", 503);
      if (state === "acquisition-loading") return new Promise(() => {});
      if (conflict) { snapshot = acquisitionFixture("DRAFT"); snapshot.responses.measurements.bodyWeightLb = 199; }
      if (path.includes("/coach/")) return reply({ data: { acquisition: snapshot.status === "SUBMITTED" ? snapshot : { ...snapshot, status: "NOT_SUBMITTED", version: 0, responses: null, derived: null, updatedAt: null, submittedAt: null } } });
      return reply({ data: { acquisition: snapshot } });
    }
    if (snapshot.status === "SUBMITTED") return error("INVALID_STATE", 409);
    if (path.endsWith("/photos")) {
      if (state === "acquisition-photo-rejected" && !photoRejected) { photoRejected = true; return error("VALIDATION_FAILED", 415); }
      if (state === "acquisition-photo-error") return error("TEMPORARILY_UNAVAILABLE", 503);
      const form = init?.body as FormData;
      const parsed = weekZeroPhotoMutationSchema.safeParse({ slot: form.get("slot"), assetId: form.get("assetId"), expectedVersion: Number(form.get("expectedVersion")), clientMutationId: form.get("clientMutationId") });
      if (!parsed.success || !(form.get("file") instanceof File)) return error("VALIDATION_FAILED", 400);
      const input = parsed.data;
      const replay = receipts.get(input.clientMutationId);
      if (replay) return reply({ data: { acquisition: replay } });
      if (input.expectedVersion !== snapshot.version) return error("VERSION_CONFLICT", 409);
      uploaded.add(input.assetId);
      snapshot = { ...snapshot, status: "DRAFT", version: snapshot.version + 1, updatedAt: now(), responses: { ...snapshot.responses, photos: { ...snapshot.responses.photos, [input.slot]: input.assetId } } };
      receipts.set(input.clientMutationId, structuredClone(snapshot));
      return reply({ data: { acquisition: snapshot } });
    }
    const command = JSON.parse(String(init?.body ?? "{}"));
    if (state === "acquisition-save-error-once" && failedId === null) { failedId = command.clientMutationId; return error("TEMPORARILY_UNAVAILABLE", 503); }
    if (failedId && failedId !== command.clientMutationId) return error("DUPLICATE", 409);
    if (state === "acquisition-conflict") { conflict = true; return error("VERSION_CONFLICT", 409); }
    const replay = receipts.get(command.clientMutationId);
    if (replay) return reply({ data: { acquisition: replay } });
    if (command.expectedVersion !== snapshot.version) return error("VERSION_CONFLICT", 409);
    if (path.endsWith("/submit")) {
      if (scenario === "acquisition-submit-error") return error("TEMPORARILY_UNAVAILABLE", 503);
      if (!completeWeekZeroAcquisitionResponsesSchema.safeParse(snapshot.responses).success
        || ![snapshot.responses.photos.front, snapshot.responses.photos.side, snapshot.responses.photos.back].every(id => id && uploaded.has(id))) return error("VALIDATION_FAILED", 400);
      snapshot = { ...snapshot, status: "SUBMITTED", version: snapshot.version + 1, updatedAt: now(), submittedAt: now() };
    } else {
      const parsed = saveWeekZeroAcquisitionRequestSchema.safeParse(command);
      if (!parsed.success) return error("VALIDATION_FAILED", 400);
      snapshot = { ...snapshot, status: "DRAFT", version: snapshot.version + 1, responses: parsed.data.responses, derived: deriveWeekZeroAcquisition(parsed.data.responses), updatedAt: now() };
    }
    receipts.set(command.clientMutationId, structuredClone(snapshot));
    return reply({ data: { acquisition: snapshot } });
  };
}
