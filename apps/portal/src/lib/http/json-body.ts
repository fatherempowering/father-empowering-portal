import { M1ContractError } from "@/lib/contracts/m1";

const MAX_M1_JSON_BYTES = 4_096;

export async function readM1JsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_M1_JSON_BYTES) {
    throw new M1ContractError("VALIDATION_FAILED", "Request body is too large", 400);
  }

  const raw = await readBoundedUtf8Body(request);

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

async function readBoundedUtf8Body(request: Request): Promise<string> {
  if (!request.body) return "";

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    throw new M1ContractError("VALIDATION_FAILED", "Unable to read request body", 400);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_M1_JSON_BYTES) {
        await reader.cancel("M1 request body limit exceeded").catch(() => undefined);
        throw new M1ContractError("VALIDATION_FAILED", "Request body is too large", 400);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof M1ContractError) throw error;
    await reader.cancel("M1 request body read failed").catch(() => undefined);
    throw new M1ContractError("VALIDATION_FAILED", "Unable to read request body", 400);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new M1ContractError("VALIDATION_FAILED", "Invalid UTF-8 request", 400);
  }
}
