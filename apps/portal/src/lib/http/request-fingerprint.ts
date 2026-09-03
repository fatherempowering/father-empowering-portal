import { isIP } from "node:net";

export function requestFingerprint(request: Request): string {
  const forwardedFor = request.headers.get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim()
    .slice(0, 64);

  // User-Agent is attacker-controlled and must not create a fresh database
  // bucket. Vercel normalizes this deployment header; an invalid/missing value
  // collapses into one conservative local bucket.
  return forwardedFor && isIP(forwardedFor) ? forwardedFor : "unknown";
}
