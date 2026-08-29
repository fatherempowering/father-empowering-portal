const input = process.argv[2] ?? "http://127.0.0.1:3000";
const timeoutMs = Number(process.argv[3] ?? 60_000);
let baseUrl;

try {
  const parsed = new URL(input);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "3000" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("non-canonical URL");
  }
  baseUrl = parsed;
} catch {
  throw new Error("BLOCKED: the M1 readiness probe only accepts the canonical loopback origin.");
}

if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
  throw new Error("BLOCKED: invalid M1 readiness timeout.");
}

const target = new URL("/api/v1/internal/outbox", baseUrl);
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  try {
    const response = await fetch(target, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(2_000),
    });
    const payload = await response.json().catch(() => null);
    if (
      response.status === 401 &&
      response.headers.get("www-authenticate") === "Bearer" &&
      payload?.error?.code === "UNAUTHENTICATED"
    ) {
      process.exit(0);
    }
  } catch {
    // The application is still starting.
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error("BLOCKED: the canonical M1 application endpoint did not become ready in time.");
