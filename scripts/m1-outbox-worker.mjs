import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appUrl = new URL(process.env.M1_APP_URL ?? "http://127.0.0.1:3000");
const workerSecret = process.env.OUTBOX_WORKER_SECRET;
const pollMilliseconds = Number.parseInt(process.env.M1_WORKER_POLL_MS ?? "500", 10);
const readyFileInput = process.env.M1_WORKER_READY_FILE;

if (
  appUrl.protocol !== "http:" ||
  appUrl.hostname !== "127.0.0.1" ||
  appUrl.port !== "3000" ||
  appUrl.username !== "" ||
  appUrl.password !== "" ||
  appUrl.pathname !== "/" ||
  appUrl.search !== "" ||
  appUrl.hash !== ""
) {
  throw new Error("The local M1 worker only accepts the canonical loopback origin.");
}
if (!workerSecret || workerSecret.length < 32) {
  throw new Error("OUTBOX_WORKER_SECRET must contain at least 32 characters.");
}
if (!readyFileInput) {
  throw new Error("M1_WORKER_READY_FILE is required.");
}
if (!Number.isFinite(pollMilliseconds) || pollMilliseconds < 100 || pollMilliseconds > 60_000) {
  throw new Error("M1_WORKER_POLL_MS must be between 100 and 60000.");
}

const endpoint = new URL("/api/v1/internal/outbox", appUrl);
const readyFile = resolve(readyFileInput);
let stopping = false;
let ready = false;
const shutdownController = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    shutdownController.abort();
  });
}

while (!stopping) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret}` },
      redirect: "manual",
      signal: AbortSignal.any([AbortSignal.timeout(2_000), shutdownController.signal]),
    });
    if ([401, 403].includes(response.status)) {
      process.stderr.write("[m1-worker] authorization failed\n");
      process.exitCode = 1;
      break;
    }
    if (response.status >= 300 && response.status < 500) {
      process.stderr.write("[m1-worker] endpoint contract rejected\n");
      process.exitCode = 1;
      break;
    }
    if (response.status !== 200) {
      throw new Error("transient endpoint failure");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      process.stderr.write("[m1-worker] invalid readiness response\n");
      process.exitCode = 1;
      break;
    }
    if (
      !Number.isInteger(payload?.processed) ||
      payload.processed < 0 ||
      !Array.isArray(payload?.outcomes)
    ) {
      process.stderr.write("[m1-worker] invalid readiness response\n");
      process.exitCode = 1;
      break;
    }
    if (!ready) {
      await writeFile(readyFile, "ready\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
      ready = true;
    }
  } catch {
    if (!stopping) {
      process.stderr.write("[m1-worker] transient local delivery attempt failed\n");
    }
  }

  if (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
}
