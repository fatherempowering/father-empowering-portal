import { isClientActivationError } from "../activation/errors";
import { M1ContractError } from "@/lib/contracts/m1";
import { readM1JsonObject } from "@/lib/http/json-body";
import { requireSameOrigin } from "@/lib/http/origin";

export async function readSmallJsonObject(request: Request): Promise<Record<string, unknown>> {
  // The shared reader measures the bytes actually received, so a missing or
  // dishonest Content-Length header cannot bypass the 4 KiB public API cap.
  return readM1JsonObject(request);
}

export function assertSameOrigin(request: Request): void {
  requireSameOrigin(request);
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
