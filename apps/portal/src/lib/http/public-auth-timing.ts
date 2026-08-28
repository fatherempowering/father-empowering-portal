import { randomInt } from "node:crypto";

const MINIMUM_PUBLIC_AUTH_MS = 700;
const PUBLIC_AUTH_JITTER_MS = 150;

export async function settlePublicAuthResponse(startedAt: number): Promise<void> {
  const targetDuration = MINIMUM_PUBLIC_AUTH_MS + randomInt(PUBLIC_AUTH_JITTER_MS + 1);
  const remaining = targetDuration - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
