import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import {
  saveWeekZeroAcquisitionRequestSchema,
  submitWeekZeroAcquisitionRequestSchema,
  weekZeroPhotoMutationSchema,
} from "@/lib/contracts/week-zero-acquisition";
import { M1ContractError } from "@/lib/contracts/m1";
import { requireOwnClientAccess } from "@/lib/auth/own-client-access";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import {
  getCoachClientWeekZeroAcquisition,
  getCoachClientWeekZeroPhoto,
  getOwnWeekZeroAcquisition,
  getOwnWeekZeroPhoto,
  saveOwnWeekZeroAcquisition,
  submitOwnWeekZeroAcquisition,
  uploadOwnWeekZeroPhoto,
} from "@/lib/week-zero/acquisition-repository";

const MAX_ACQUISITION_JSON_BYTES = 65_536;
const MAX_PHOTO_BYTES = 4_194_304;
const MAX_MULTIPART_BYTES = MAX_PHOTO_BYTES + 65_536;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const photoContentTypeSchema = z.enum(ALLOWED_PHOTO_TYPES);

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

const PHOTO_HEADERS = {
  ...NO_STORE_HEADERS,
  "Content-Disposition": "inline",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

function hasValidPhotoSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function requiredFormText(form: FormData, field: string): string {
  const value = form.get(field);
  if (typeof value !== "string") {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid photo request", 400);
  }
  return value;
}

async function parsePhotoUpload(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength <= 0 || parsedLength > MAX_MULTIPART_BYTES) {
      throw new M1ContractError("VALIDATION_FAILED", "Progress photo is too large", 400);
    }
  }

  if (!request.body) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid photo request", 400);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      throw new M1ContractError("VALIDATION_FAILED", "Progress photo is too large", 400);
    }
    chunks.push(value);
  }
  const boundedBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    boundedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentTypeHeader = request.headers.get("content-type");
  if (!contentTypeHeader?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid photo request", 400);
  }
  const form = await new Response(boundedBody, {
    headers: { "Content-Type": contentTypeHeader },
  }).formData();
  const expectedFields = ["slot", "assetId", "expectedVersion", "clientMutationId", "file"];
  const submittedFields = Array.from(form.keys());
  if (
    submittedFields.length !== expectedFields.length ||
    expectedFields.some((field) => submittedFields.filter((candidate) => candidate === field).length !== 1) ||
    submittedFields.some((field) => !expectedFields.includes(field))
  ) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid photo request", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid progress photo", 400);
  }
  const contentType = photoContentTypeSchema.parse(file.type.toLowerCase());
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  if (sourceBytes.byteLength !== file.size || !hasValidPhotoSignature(sourceBytes, contentType)) {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid progress photo", 400);
  }

  let normalized: Uint8Array;
  try {
    const metadata = await sharp(sourceBytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
      throw new Error("Unsupported image format");
    }
    normalized = new Uint8Array(
      await sharp(sourceBytes, { failOn: "error", limitInputPixels: 40_000_000 })
        .rotate()
        .resize(1_600, 1_600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer(),
    );
  } catch {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid progress photo", 400);
  }
  if (normalized.byteLength <= 0 || normalized.byteLength > MAX_PHOTO_BYTES) {
    throw new M1ContractError("VALIDATION_FAILED", "Progress photo is too large", 400);
  }

  return {
    mutation: weekZeroPhotoMutationSchema.parse({
      slot: requiredFormText(form, "slot"),
      assetId: requiredFormText(form, "assetId"),
      expectedVersion: Number(requiredFormText(form, "expectedVersion")),
      clientMutationId: requiredFormText(form, "clientMutationId"),
    }),
    bytes: normalized,
    contentType: "image/jpeg" as const,
  };
}

async function photoResponse(photo: Blob): Promise<NextResponse> {
  const contentType = photoContentTypeSchema.safeParse(photo.type.toLowerCase());
  if (!contentType.success) {
    throw new M1ContractError("NOT_FOUND", "Progress photo not found", 404);
  }
  return new NextResponse(await photo.arrayBuffer(), {
    status: 200,
    headers: { ...PHOTO_HEADERS, "Content-Type": contentType.data },
  });
}

export async function getOwnWeekZeroAcquisitionHttp(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: { acquisition: await getOwnWeekZeroAcquisition() } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function saveOwnWeekZeroAcquisitionHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = saveWeekZeroAcquisitionRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_ACQUISITION_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { acquisition: await saveOwnWeekZeroAcquisition(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function submitOwnWeekZeroAcquisitionHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = submitWeekZeroAcquisitionRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_ACQUISITION_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { acquisition: await submitOwnWeekZeroAcquisition(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function uploadOwnWeekZeroPhotoHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    await requireOwnClientAccess();
    const acquisition = await uploadOwnWeekZeroPhoto(await parsePhotoUpload(request));
    return NextResponse.json(
      { data: { acquisition } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function getOwnWeekZeroPhotoHttp(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    return await photoResponse(
      await getOwnWeekZeroPhoto(url.searchParams.get("slot") ?? "", url.searchParams.get("assetId") ?? ""),
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function getCoachClientWeekZeroAcquisitionHttp(
  clientId: string,
): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: { acquisition: await getCoachClientWeekZeroAcquisition(clientId) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function getCoachClientWeekZeroPhotoHttp(
  request: Request,
  clientId: string,
): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    return await photoResponse(
      await getCoachClientWeekZeroPhoto(
        clientId,
        url.searchParams.get("slot") ?? "",
        url.searchParams.get("assetId") ?? "",
      ),
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
