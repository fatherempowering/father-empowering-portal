const appUrl = new URL(process.env.M1_APP_URL ?? "http://127.0.0.1:3000");
const workerSecret = process.env.OUTBOX_WORKER_SECRET;
const pollMilliseconds = Number.parseInt(process.env.M1_WORKER_POLL_MS ?? "500", 10);

if (appUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(appUrl.hostname)) {
  throw new Error("The local M1 worker only accepts a loopback application URL.");
}
if (!workerSecret || workerSecret.length < 32) {
  throw new Error("OUTBOX_WORKER_SECRET must contain at least 32 characters.");
}
if (!Number.isFinite(pollMilliseconds) || pollMilliseconds < 100 || pollMilliseconds > 60_000) {
  throw new Error("M1_WORKER_POLL_MS must be between 100 and 60000.");
}

const endpoint = new URL("/api/v1/internal/outbox", appUrl);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret}` },
    });
    if (!response.ok) {
      throw new Error(`Outbox endpoint returned ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    process.stderr.write(`[m1-worker] ${message}\n`);
  }

  if (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
}
