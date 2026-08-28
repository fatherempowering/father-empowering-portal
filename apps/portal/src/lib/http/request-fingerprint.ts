export function requestFingerprint(request: Request): string {
  const forwardedFor = request.headers.get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown";
  return `${forwardedFor ?? "unknown"}:${userAgent}`;
}
