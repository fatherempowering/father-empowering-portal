import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES } from "@/lib/contracts/week-zero-acquisition";
import { M1ContractError } from "@/lib/contracts/m1";

const repository = vi.hoisted(() => ({
  getOwnWeekZeroAcquisition: vi.fn(),
  saveOwnWeekZeroAcquisition: vi.fn(),
  submitOwnWeekZeroAcquisition: vi.fn(),
  uploadOwnWeekZeroPhoto: vi.fn(),
  getOwnWeekZeroPhoto: vi.fn(),
  getCoachClientWeekZeroAcquisition: vi.fn(),
  getCoachClientWeekZeroPhoto: vi.fn(),
}));
const origin = vi.hoisted(() => ({ requireSameOrigin: vi.fn() }));
const access = vi.hoisted(() => ({ requireOwnClientAccess: vi.fn() }));

vi.mock("@/lib/week-zero/acquisition-repository", () => repository);
vi.mock("@/lib/http/origin", () => origin);
vi.mock("@/lib/auth/own-client-access", () => access);

import {
  getOwnWeekZeroAcquisitionHttp,
  uploadOwnWeekZeroPhotoHttp,
} from "@/features/week-zero/server/acquisition-http";

const snapshot = {
  kind: "WEEK_ZERO_ACQUISITION" as const,
  schemaVersion: 1 as const,
  status: "DRAFT" as const,
  version: 1,
  responses: EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES,
  derived: { cardio: null },
  updatedAt: "2026-10-20T12:00:00.000Z",
  submittedAt: null,
};

function photoForm(bytes: Uint8Array, type = "image/jpeg") {
  const form = new FormData();
  form.set("slot", "front");
  form.set("assetId", "11111111-1111-4111-8111-111111111111");
  form.set("expectedVersion", "1");
  form.set("clientMutationId", "22222222-2222-4222-8222-222222222222");
  form.set("file", new File([bytes.slice().buffer as ArrayBuffer], "private-name.jpg", { type }));
  return form;
}

function uploadRequest(form: FormData) {
  return new Request("https://app.example/api/v1/client/week-zero/photos", {
    method: "POST",
    headers: { Origin: "https://app.example" },
    body: form,
  });
}

describe("Week Zero acquisition HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.requireOwnClientAccess.mockResolvedValue({
      organizationId: "33333333-3333-4333-8333-333333333333",
      ownClientId: "44444444-4444-4444-8444-444444444444",
    });
    repository.getOwnWeekZeroAcquisition.mockResolvedValue(snapshot);
    repository.uploadOwnWeekZeroPhoto.mockResolvedValue({ ...snapshot, version: 2 });
  });

  it("returns the acquisition only through a private no-store envelope", async () => {
    const response = await getOwnWeekZeroAcquisitionHttp();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ data: { acquisition: snapshot } });
  });

  it("authenticates before parsing or decoding an uploaded image", async () => {
    access.requireOwnClientAccess.mockRejectedValue(
      new M1ContractError("UNAUTHENTICATED", "Authentication required", 401),
    );
    const response = await uploadOwnWeekZeroPhotoHttp(
      new Request("https://app.example/api/v1/client/week-zero/photos", {
        method: "POST",
        headers: { Origin: "https://app.example", "Content-Type": "application/octet-stream" },
        body: "not an image",
      }),
    );
    expect(response.status).toBe(401);
    expect(repository.uploadOwnWeekZeroPhoto).not.toHaveBeenCalled();
  });

  it("decodes and re-encodes a real image before repository upload", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "red" },
    })
      .png()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const response = await uploadOwnWeekZeroPhotoHttp(uploadRequest(photoForm(png, "image/png")));
    expect(response.status).toBe(200);
    const forwarded = repository.uploadOwnWeekZeroPhoto.mock.calls[0][0];
    expect(forwarded.contentType).toBe("image/jpeg");
    expect(forwarded.bytes[0]).toBe(0xff);
    expect(forwarded.bytes[1]).toBe(0xd8);
    const metadata = await sharp(forwarded.bytes).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.orientation).toBeUndefined();
  });

  it("rejects a forged JPEG before storage", async () => {
    const forged = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    const response = await uploadOwnWeekZeroPhotoHttp(uploadRequest(photoForm(forged)));
    expect(response.status).toBe(400);
    expect(repository.uploadOwnWeekZeroPhoto).not.toHaveBeenCalled();
  });

  it("rejects duplicate or extra multipart fields", async () => {
    const jpeg = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "blue" },
    }).jpeg().toBuffer();
    const duplicate = photoForm(jpeg);
    duplicate.append("slot", "side");
    const duplicateResponse = await uploadOwnWeekZeroPhotoHttp(uploadRequest(duplicate));
    expect(duplicateResponse.status).toBe(400);

    const extra = photoForm(jpeg);
    extra.set("privateFileName", "must-not-be-persisted");
    const extraResponse = await uploadOwnWeekZeroPhotoHttp(uploadRequest(extra));
    expect(extraResponse.status).toBe(400);
    expect(repository.uploadOwnWeekZeroPhoto).not.toHaveBeenCalled();
  });

  it("rejects an oversized stream without trusting Content-Length", async () => {
    const chunk = new Uint8Array(2_200_000);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request(
      "https://app.example/api/v1/client/week-zero/photos",
      {
        method: "POST",
        headers: {
          Origin: "https://app.example",
          "Content-Type": "multipart/form-data; boundary=bounded",
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    expect(request.headers.get("content-length")).toBeNull();
    const response = await uploadOwnWeekZeroPhotoHttp(request);
    expect(response.status).toBe(400);
    expect(repository.uploadOwnWeekZeroPhoto).not.toHaveBeenCalled();
  });
});
