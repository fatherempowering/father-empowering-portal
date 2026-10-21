import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES, WEEK_ZERO_MOVEMENT_KEYS,
  weekZeroAcquisitionSnapshotSchema, type WeekZeroAcquisitionSnapshot, type WeekZeroPhotoSlot,
} from "@/lib/contracts/week-zero-acquisition";
import { authenticatedFetch, type M1SsrSession, type M1TestEnvironment } from "./m1-local-supabase";

type Context = {
  environment: M1TestEnvironment;
  owner: M1SsrSession; otherClient: M1SsrSession; assigned: M1SsrSession; unverified: M1SsrSession;
  unassigned: M1SsrSession; admin: M1SsrSession; crossOrg: M1SsrSession;
  clientId: string; organizationId: string;
};

/** Registers inside the existing sequential v1 suite, reusing its isolated users.
 * v1 has already been submitted: this explicitly tests additive historical compatibility. */
export function registerWeekZeroAcquisitionCases(getContext: () => Context) {
  describe.sequential("Full Week Zero — real HTTP / private Storage / v1 preservation", { timeout: 30_000 }, () => {
    const path = "/api/v1/client/week-zero/acquisition";
    const photos = "/api/v1/client/week-zero/photos";
    let snapshot: WeekZeroAcquisitionSnapshot;
    let historical: unknown;
    const assets: Partial<Record<WeekZeroPhotoSlot, string>> = {};
    const request = (route: string, init?: RequestInit, session?: M1SsrSession) => {
      const c = getContext(); return authenticatedFetch(c.environment, session ?? c.owner, route, init);
    };
    const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const read = async (response: Response) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      return weekZeroAcquisitionSnapshotSchema.parse((await response.json()).data?.acquisition);
    };
    const coachPath = () => `/api/v1/coach/clients/${getContext().clientId}/week-zero/acquisition`;
    const coachPhoto = (slot: string, id: string) => `/api/v1/coach/clients/${getContext().clientId}/week-zero/photos?slot=${slot}&assetId=${id}`;
    const upload = (slot: WeekZeroPhotoSlot, assetId: string, version: number, mutationId: string, bytes: Uint8Array, mime = "image/png") => {
      const form = new FormData();
      form.set("slot", slot); form.set("assetId", assetId); form.set("expectedVersion", String(version)); form.set("clientMutationId", mutationId);
      form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), "synthetic.png");
      return request(photos, { method: "POST", body: form });
    };

    it("keeps historical v1 submitted while starting full Week Zero from NOT_STARTED", async () => {
      historical = await (await request("/api/v1/client/week-zero")).json();
      expect(historical).toMatchObject({ data: { assessment: { status: "SUBMITTED" } } });
      snapshot = await read(await request(path));
      expect(snapshot).toMatchObject({ status: "NOT_STARTED", version: 0, derived: { cardio: null } });
      expect(snapshot.responses).toEqual(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES);
      const anonymous = await fetch(new URL(path, getContext().environment.appUrl), { redirect: "manual" });
      expect(anonymous.status).toBe(401);
      const wrongOrigin = await fetch(new URL(path, getContext().environment.appUrl), {
        ...json("PUT", { expectedVersion: 0, clientMutationId: randomUUID(), responses: snapshot.responses }),
        headers: { "content-type": "application/json", origin: "https://attacker.invalid", cookie: getContext().owner.cookieHeader() }, redirect: "manual",
      });
      expect(wrongOrigin.status).toBe(403);
    });

    it("saves partial performance, preserves replay, hides draft and rejects forged photo IDs", async () => {
      const responses = structuredClone(snapshot.responses);
      responses.loads.squat = { ...responses.loads.squat, status: "DONE", variant: "BARBELL_SQUAT", mode: "TOTAL", load: 40 };
      const command = { expectedVersion: 0, clientMutationId: randomUUID(), responses };
      snapshot = await read(await request(path, json("PUT", command)));
      expect(await read(await request(path, json("PUT", command)))).toEqual(snapshot);
      expect(snapshot.responses.loads.squat.unit).toBeNull();
      const c = getContext();
      for (const session of [c.assigned, c.admin]) {
        const response = await request(coachPath(), undefined, session);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ data: { acquisition: { status: "NOT_SUBMITTED", responses: null, derived: null } } });
      }
      const forged = structuredClone(snapshot.responses); forged.photos.front = randomUUID();
      expect((await request(path, json("PUT", { expectedVersion: snapshot.version, clientMutationId: randomUUID(), responses: forged }))).status).toBe(400);
      expect((await request(`${path}/submit`, json("POST", { expectedVersion: snapshot.version, clientMutationId: randomUUID() }))).status).toBe(400);
      expect((await request(path, json("PUT", { expectedVersion: 0, clientMutationId: randomUUID(), responses }))).status).toBe(409);
    });

    it("rejects malformed image data and browser-direct Storage uploads", async () => {
      const invalid = await upload("front", randomUUID(), snapshot.version, randomUUID(), Uint8Array.of(255, 216, 255), "image/jpeg");
      expect(invalid.status).toBe(400);
      const c = getContext();
      const storage = await c.owner.client.storage.from("week-zero-photos").upload(
        `${c.organizationId}/${c.clientId}/front/${randomUUID()}`, new Uint8Array([1, 2, 3]), { contentType: "image/png" },
      );
      expect(storage.error).not.toBeNull();
      expect((await read(await request(path))).version).toBe(snapshot.version);
    });

    it("uploads three real images, strips metadata, preserves retry and isolates draft photos", async () => {
      const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ff6600" } }).withMetadata({ exif: { IFD0: { Artist: "SYNTHETIC_METADATA" } } }).png().toBuffer();
      for (const slot of ["front", "side", "back"] as const) {
        const assetId = randomUUID(), mutationId = randomUUID(), version = snapshot.version;
        snapshot = await read(await upload(slot, assetId, version, mutationId, bytes));
        assets[slot] = assetId;
        expect(snapshot.responses.photos[slot]).toBe(assetId);
        expect(await read(await upload(slot, assetId, version, mutationId, bytes))).toEqual(snapshot);
        const photoPath = `${photos}?slot=${slot}&assetId=${assetId}`;
        const ownerRead = await request(photoPath);
        expect(ownerRead.status).toBe(200);
        expect(ownerRead.headers.get("cache-control")).toContain("no-store");
        expect(ownerRead.headers.get("content-type")).toBe("image/jpeg");
        expect((await sharp(Buffer.from(await ownerRead.arrayBuffer())).metadata()).exif).toBeUndefined();
        for (const session of [getContext().assigned, getContext().admin]) expect((await request(coachPhoto(slot, assetId), undefined, session)).status).toBe(404);
        expect((await request(photoPath, undefined, getContext().otherClient)).status).toBe(404);
        expect((await fetch(new URL(photoPath, getContext().environment.appUrl), { redirect: "manual" })).status).toBe(401);
      }
    });

    it("requires every movement, then accepts honest exceptions and computes actual cardio server-side", async () => {
      const responses = structuredClone(snapshot.responses);
      responses.instructionsAccepted = true;
      responses.measurements.bodyWeightLb = 214.5; responses.measurements.waistIn = 41.25;
      for (const key of WEEK_ZERO_MOVEMENT_KEYS) responses.loads[key] = { ...EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES.loads[key], status: "NOT_PERFORMED", reason: "Matériel indisponible pour ce mouvement" };
      responses.loads.horizontalPress = { status: "DONE", variant: "DUMBBELL_PRESS", mode: "PER_HAND", unit: "KG", load: 20, reps: 8, rir: 2, reason: null, note: "Calibration contrôlée" };
      responses.cardio = { status: "DONE", reason: null, age: 40, weightKg: 90, sex: "MALE", trainingLevel: "NOT_HIGHLY_TRAINED", totalSeconds: 450, notes: "Test synthétique HTTP" };
      responses.mobility = { painSquat: "NOT_PERFORMED", painHinge: "NOT_PERFORMED", painPush: "NO", painPull: "NOT_PERFORMED", painCardio: "NO", limitedMovement: "N.A.", comfortableMovement: "Poussée horizontale", tightArea: "N.A." };
      const incomplete = structuredClone(responses); incomplete.loads.legPress = structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES.loads.legPress);
      snapshot = await read(await request(path, json("PUT", { expectedVersion: snapshot.version, clientMutationId: randomUUID(), responses: incomplete })));
      expect((await request(`${path}/submit`, json("POST", { expectedVersion: snapshot.version, clientMutationId: randomUUID() }))).status).toBe(400);
      snapshot = await read(await request(path, json("PUT", { expectedVersion: snapshot.version, clientMutationId: randomUUID(), responses })));
      expect(snapshot.derived.cardio?.estimatedVo2MaxMlKgMin).toBeCloseTo(43.8888889, 5);
      const command = { expectedVersion: snapshot.version, clientMutationId: randomUUID() };
      const results = await Promise.all([request(`${path}/submit`, json("POST", command)), request(`${path}/submit`, json("POST", command))]);
      snapshot = await read(results[0]); expect(await read(results[1])).toEqual(snapshot);
      expect(snapshot.status).toBe("SUBMITTED");
      expect(snapshot.responses.loads.legPress.reason).toBe("Matériel indisponible pour ce mouvement");
      expect(await (await request("/api/v1/client/week-zero")).json()).toEqual(historical);
    });

    it("reveals submitted results and photos only to authorized staff and prohibits alteration", async () => {
      const c = getContext();
      for (const session of [c.assigned, c.admin]) {
        const response = await request(coachPath(), undefined, session);
        expect(response.status).toBe(200);
        expect((await response.json()).data.acquisition).toMatchObject({ status: "SUBMITTED", responses: snapshot.responses });
        expect((await request(coachPhoto("front", assets.front!), undefined, session)).status).toBe(200);
      }
      expect((await request(coachPath(), undefined, c.unverified)).status).toBe(403);
      for (const session of [c.unassigned, c.crossOrg]) {
        expect((await request(coachPath(), undefined, session)).status).toBe(404);
        expect((await request(coachPhoto("front", assets.front!), undefined, session)).status).toBe(404);
      }
      const crossRead = await c.otherClient.client.from("week_zero_acquisitions").select("responses").eq("client_id", c.clientId);
      expect(crossRead.data ?? []).toEqual([]);
      expect((await request(path, json("PUT", { expectedVersion: snapshot.version, clientMutationId: randomUUID(), responses: snapshot.responses }))).status).toBe(409);
      const latePhoto = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ff6600" } }).png().toBuffer();
      expect((await upload("front", randomUUID(), snapshot.version, randomUUID(), latePhoto)).status).toBe(409);
      const removal = await c.owner.client.storage.from("week-zero-photos").remove([`${c.organizationId}/${c.clientId}/front/${assets.front}`]);
      // Storage may return an empty list rather than an authorization error for a denied DELETE.
      expect(removal.data ?? []).toHaveLength(0);
      expect((await request(`${photos}?slot=front&assetId=${assets.front}`)).status).toBe(200);
      expect((await read(await request(path))).status).toBe("SUBMITTED");
    });
  });
}
