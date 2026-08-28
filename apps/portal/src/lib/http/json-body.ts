import { M1ContractError } from "@/lib/contracts/m1";

const MAX_M1_JSON_BYTES = 4_096;

export async function readM1JsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_M1_JSON_BYTES) {
    throw new M1ContractError("VALIDATION_FAILED", "Request body is too large", 400);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_M1_JSON_BYTES) {
    throw new M1ContractError("VALIDATION_FAILED", "Request body is too large", 400);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid JSON request", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new M1ContractError("VALIDATION_FAILED", "A JSON object is required", 400);
  }
  return value as Record<string, unknown>;
}
