import { isClientActivationError } from "../activation/errors";
import { M1ContractError } from "@/lib/contracts/m1";

const MAX_JSON_BYTES = 4_096;

export async function readSmallJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new HttpInputError("Request body is too large.");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpInputError("Request body must be valid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpInputError("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpForbiddenError();
  }
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("referrer-policy", "no-referrer");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function safeHttpError(error: unknown): Response {
  if (error instanceof M1ContractError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof HttpForbiddenError) {
    return jsonResponse({ error: { code: "FORBIDDEN", message: "Request denied." } }, { status: 403 });
  }

  if (error instanceof HttpInputError) {
    return jsonResponse(
      { error: { code: "VALIDATION_FAILED", message: error.message } },
      { status: 400 },
    );
  }

  if (isClientActivationError(error)) {
    const status =
      error.code === "INVITATION_UNAVAILABLE"
        ? 404
        : error.code === "RATE_LIMITED"
          ? 429
          : error.code === "OTP_REJECTED"
            ? 401
            : 400;

    return jsonResponse({ error: { code: error.code, message: error.message } }, { status });
  }

  // Do not expose database, Auth provider or RPC details.
  return jsonResponse(
    { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Please try again." } },
    { status: 503 },
  );
}

export class HttpInputError extends Error {}
export class HttpForbiddenError extends Error {}
