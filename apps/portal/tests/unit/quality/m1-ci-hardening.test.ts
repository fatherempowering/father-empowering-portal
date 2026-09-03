import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const logScanner = fileURLToPath(
  new URL("../../../../../scripts/m1-log-safety.mjs", import.meta.url),
);
const waitForApplication = fileURLToPath(
  new URL("../../../../../scripts/m1-wait-for-http.mjs", import.meta.url),
);
const outboxWorker = fileURLToPath(
  new URL("../../../../../scripts/m1-outbox-worker.mjs", import.meta.url),
);
const gatePath = fileURLToPath(
  new URL("../../../../../scripts/m1-quality-gate.sh", import.meta.url),
);
const workflowPath = fileURLToPath(
  new URL("../../../../../.github/workflows/m1-ci.yml", import.meta.url),
);
const playwrightConfigPath = fileURLToPath(
  new URL("../../e2e/playwright.config.ts", import.meta.url),
);

const temporaryPaths: string[] = [];
const childProcesses: ChildProcess[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryPaths.push(directory);
  return directory;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for an isolated M1 test process.");
}

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    }
  }
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe.sequential("M1 CI hardening", () => {
  it("scans sensitive captures before publication and fails closed", () => {
    const fixture = temporaryDirectory("m1-log-safety-");
    const safeLog = join(fixture, "safe.log");
    const unsafeLog = join(fixture, "unsafe.log");
    const spacedOtpLog = join(fixture, "spaced-otp.log");
    const exactSecretLog = join(fixture, "exact-secret.log");
    const exactSecret = "synthetic-worker-secret-that-must-stay-private";
    writeFileSync(safeLog, "PASS: isolated browser journey completed\n");
    writeFileSync(unsafeLog, "browser assertion received OTP 654321\n");
    writeFileSync(spacedOtpLog, "browser assertion received 654 321\n");
    writeFileSync(exactSecretLog, `authorization=${exactSecret}\n`);

    const safe = spawnSync(process.execPath, [logScanner, safeLog], { encoding: "utf8" });
    const unsafe = spawnSync(process.execPath, [logScanner, unsafeLog], {
      encoding: "utf8",
    });
    const exact = spawnSync(process.execPath, [logScanner, exactSecretLog], {
      encoding: "utf8",
      env: { ...process.env, OUTBOX_WORKER_SECRET: exactSecret },
    });
    const spaced = spawnSync(process.execPath, [logScanner, spacedOtpLog], {
      encoding: "utf8",
    });
    const unreadable = spawnSync(process.execPath, [logScanner, join(fixture, "missing")], {
      encoding: "utf8",
    });

    expect(safe.status).toBe(0);
    expect(unsafe.status).toBe(1);
    expect(`${unsafe.stdout}${unsafe.stderr}`).toContain("sensitive M1 command output was withheld");
    expect(`${unsafe.stdout}${unsafe.stderr}`).not.toContain("654321");
    expect(spaced.status).toBe(1);
    expect(`${spaced.stdout}${spaced.stderr}`).not.toContain("654 321");
    expect(exact.status).toBe(1);
    expect(`${exact.stdout}${exact.stderr}`).not.toContain(exactSecret);
    expect(unreadable.status).toBe(2);
    expect(`${unreadable.stdout}${unreadable.stderr}`).toContain("could not be scanned safely");
  });

  it("withholds an autonomous invitation bearer without echoing it", () => {
    const fixture = temporaryDirectory("m1-autonomous-token-");
    const log = join(fixture, "e2e.log");
    const token = "kN1ytPKzQAYT3vdAYPmLYcKpIzG6M_ZvVE9jF5nxvN8";
    writeFileSync(log, `received value: ${token}\n`);

    const result = spawnSync(process.execPath, [logScanner, log], { encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("sensitive M1 command output was withheld");
    expect(output).not.toContain(token);
  });

  it("withholds an invitation bearer split across lines in an artifact directory", () => {
    const fixture = temporaryDirectory("m1-wrapped-token-");
    const nested = join(fixture, "nested");
    const log = join(nested, "e2e.log");
    const token = "kN1ytPKzQAYT3vdAYPmLYcKpIzG6M_ZvVE9jF5nxvN8";
    const first = token.slice(0, 31);
    const second = token.slice(31);
    mkdirSync(nested);
    writeFileSync(log, `Received URL /activate#token=${first}\n  ${second}\n`);

    const result = spawnSync(process.execPath, [logScanner, fixture], { encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).not.toContain(first);
    expect(output).not.toContain(second);
    expect(output).not.toContain(token);
  });

  it("withholds a bearer embedded in an ANSI terminal hyperlink", () => {
    const fixture = temporaryDirectory("m1-ansi-token-");
    const log = join(fixture, "e2e.log");
    const token = "kN1ytPKzQAYT3vdAYPmLYcKpIzG6M_ZvVE9jF5nxvN8";
    writeFileSync(
      log,
      `\u001B]8;;https://local.test/activate#token=${token}\u001B\\ouvrir\u001B]8;;\u001B\\\n`,
    );

    const result = spawnSync(process.execPath, [logScanner, log], { encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).not.toContain(token);
  });

  it("rejects a non-loopback application URL before attempting readiness", () => {
    const hostileOrigin = "https://app.fatherempowering.com";
    const result = spawnSync(process.execPath, [waitForApplication, hostileOrigin, "1000"], {
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("only accepts the canonical loopback origin");
    expect(output).not.toContain(hostileOrigin);
  });

  it("rejects hostile harness origins without disclosing local Supabase keys", () => {
    const fixture = temporaryDirectory("m1-hostile-origin-");
    const fakePnpm = join(fixture, "pnpm");
    const outputFile = join(fixture, "supabase.env");
    const serviceSecret = "sb_secret_local-fixture-that-must-not-be-logged";
    const hostileOrigin = "https://app.fatherempowering.com";
    writeFileSync(
      fakePnpm,
      `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({
        API_URL: "http://127.0.0.1:54321",
        ANON_KEY: "synthetic-anon-key",
        SERVICE_ROLE_KEY: serviceSecret,
        INBUCKET_URL: "http://127.0.0.1:54324",
      })}'\n`,
    );
    chmodSync(fakePnpm, 0o700);
    const helper = fileURLToPath(
      new URL("../../../../../scripts/m1-supabase-env.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [helper, outputFile], {
      encoding: "utf8",
      env: {
        ...process.env,
        M1_APP_URL: hostileOrigin,
        PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
        SUPABASE_WORKDIR: fixture,
      },
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("Refusing non-canonical local URL");
    expect(output).not.toContain(hostileOrigin);
    expect(output).not.toContain(serviceSecret);
    expect(existsSync(outputFile)).toBe(false);
  });

  it("creates worker readiness only after an authenticated valid response", async () => {
    const fixture = temporaryDirectory("m1-worker-ready-");
    const readyFile = join(fixture, "worker.ready");
    const authMarker = join(fixture, "authenticated");
    const fetchFixture = join(fixture, "fetch-fixture.mjs");
    const workerSecret = "synthetic-local-worker-secret-32-characters";
    writeFileSync(
      fetchFixture,
      `import { writeFileSync } from "node:fs";
globalThis.fetch = async (_url, init) => {
  const authenticated = init?.headers?.authorization === \`Bearer \${process.env.OUTBOX_WORKER_SECRET}\`;
  if (authenticated) writeFileSync(process.env.M1_AUTH_MARKER, "authenticated\\n");
  return new Response(JSON.stringify(authenticated
    ? { processed: 0, outcomes: [] }
    : { error: { code: "UNAUTHENTICATED" } }), {
    status: authenticated ? 200 : 401,
    headers: { "content-type": "application/json" },
  });
};
`,
    );

    const child = spawn(process.execPath, ["--import", fetchFixture, outboxWorker], {
      env: {
        ...process.env,
        M1_AUTH_MARKER: authMarker,
        M1_APP_URL: "http://127.0.0.1:3000",
        M1_WORKER_POLL_MS: "100",
        M1_WORKER_READY_FILE: readyFile,
        OUTBOX_WORKER_SECRET: workerSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcesses.push(child);

    await waitUntil(() => existsSync(readyFile) && readFileSync(readyFile, "utf8") === "ready\n");
    expect(readFileSync(authMarker, "utf8")).toBe("authenticated\n");
    expect(readFileSync(readyFile, "utf8")).toBe("ready\n");
    expect(statSync(readyFile).mode & 0o777).toBe(0o600);
    expect(child.exitCode).toBeNull();
  });

  it("keeps readiness absent and exits on worker authorization failure", async () => {
    const fixture = temporaryDirectory("m1-worker-denied-");
    const readyFile = join(fixture, "worker.ready");
    const fetchFixture = join(fixture, "fetch-fixture.mjs");
    const workerSecret = "synthetic-local-worker-secret-32-characters";
    writeFileSync(
      fetchFixture,
      `globalThis.fetch = async () => new Response(
  JSON.stringify({ error: { code: "UNAUTHENTICATED" } }),
  { status: 401, headers: { "content-type": "application/json" } },
);
`,
    );

    const child = spawn(process.execPath, ["--import", fetchFixture, outboxWorker], {
      env: {
        ...process.env,
        M1_APP_URL: "http://127.0.0.1:3000",
        M1_WORKER_POLL_MS: "100",
        M1_WORKER_READY_FILE: readyFile,
        OUTBOX_WORKER_SECRET: workerSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcesses.push(child);
    let output = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    await once(child, "exit");

    expect(child.exitCode).toBe(1);
    expect(existsSync(readyFile)).toBe(false);
    expect(output).toContain("authorization failed");
    expect(output).not.toContain(workerSecret);
  });

  it("treats a failed outbox outcome as blocking without leaking response data", async () => {
    const fixture = temporaryDirectory("m1-worker-outcome-failed-");
    const readyFile = join(fixture, "worker.ready");
    const fetchFixture = join(fixture, "fetch-fixture.mjs");
    const workerSecret = "synthetic-local-worker-secret-32-characters";
    const privateEventId = "private-event-identifier";
    const privateInvitationToken = "private-invitation-token";
    const privateEmail = "private-client@example.test";
    writeFileSync(
      fetchFixture,
      `let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  const payload = calls === 1
    ? { processed: 0, outcomes: [] }
    : {
        processed: 1,
        outcomes: [{
          id: ${JSON.stringify(privateEventId)},
          status: "FAILED",
          reason_code: "EMAIL_DELIVERY_FAILED",
          payload: {
            invitationToken: ${JSON.stringify(privateInvitationToken)},
            email: ${JSON.stringify(privateEmail)},
          },
        }],
      };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
`,
    );

    const child = spawn(process.execPath, ["--import", fetchFixture, outboxWorker], {
      env: {
        ...process.env,
        M1_APP_URL: "http://127.0.0.1:3000",
        M1_WORKER_POLL_MS: "100",
        M1_WORKER_READY_FILE: readyFile,
        OUTBOX_WORKER_SECRET: workerSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcesses.push(child);
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    await once(child, "exit");

    expect(child.exitCode).toBe(1);
    expect(readFileSync(readyFile, "utf8")).toBe("ready\n");
    expect(output).toContain("OUTBOX_EVENT_FAILED");
    expect(output).toContain("failed_count=1");
    expect(output).toContain("reason_code=EMAIL_DELIVERY_FAILED");
    expect(output).not.toContain(privateEventId);
    expect(output).not.toContain(privateInvitationToken);
    expect(output).not.toContain(privateEmail);
    expect(output).not.toContain(workerSecret);
  });

  it("rejects a non-allowlisted outbox failure reason without echoing it", async () => {
    const fixture = temporaryDirectory("m1-worker-outcome-invalid-");
    const readyFile = join(fixture, "worker.ready");
    const fetchFixture = join(fixture, "fetch-fixture.mjs");
    const workerSecret = "synthetic-local-worker-secret-32-characters";
    const untrustedReason = "private-client@example.test";
    writeFileSync(
      fetchFixture,
      `globalThis.fetch = async () => new Response(JSON.stringify({
  processed: 1,
  outcomes: [{ status: "FAILED", reason_code: ${JSON.stringify(untrustedReason)} }],
}), { status: 200, headers: { "content-type": "application/json" } });
`,
    );

    const child = spawn(process.execPath, ["--import", fetchFixture, outboxWorker], {
      env: {
        ...process.env,
        M1_APP_URL: "http://127.0.0.1:3000",
        M1_WORKER_POLL_MS: "100",
        M1_WORKER_READY_FILE: readyFile,
        OUTBOX_WORKER_SECRET: workerSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcesses.push(child);
    let output = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    await once(child, "exit");

    expect(child.exitCode).toBe(1);
    expect(existsSync(readyFile)).toBe(false);
    expect(output).toContain("invalid failure reason code");
    expect(output).not.toContain(untrustedReason);
    expect(output).not.toContain(workerSecret);
  });

  it("locks the workflow and gate to the isolated M1 execution contract", () => {
    const gate = readFileSync(gatePath, "utf8");
    const workflow = readFileSync(workflowPath, "utf8");
    const playwrightConfig = readFileSync(playwrightConfigPath, "utf8");
    const actionUses = [...workflow.matchAll(/^\s*uses:\s*[^@\s]+@([^\s#]+)/gm)].map(
      (match) => match[1],
    );

    expect(workflow).not.toMatch(/^\s+paths:/m);
    expect(workflow).toMatch(/^\s+push:/m);
    expect(workflow).toContain("persist-credentials: false");
    expect(actionUses.length).toBeGreaterThan(0);
    expect(actionUses.every((reference) => /^[0-9a-f]{40}$/.test(reference ?? ""))).toBe(true);
    expect(workflow).not.toMatch(/\bdeploy\b|supabase\s+(?:link|db\s+push)/i);

    expect(gate).toContain('readonly M1_APP_URL="http://127.0.0.1:3000"');
    expect(gate).toContain("next start --hostname 127.0.0.1 --port 3000");
    expect(gate).toContain("supabase test db --local");
    expect(gate).toContain("run_sensitive_captured integration");
    expect(gate).toContain("run_sensitive_captured e2e");
    expect(gate).not.toContain("run_logged integration");
    expect(gate).not.toContain("run_logged e2e");
    expect(gate).toContain("--config tests/e2e/playwright.config.ts");
    expect(gate).toContain("M1_ARTIFACT_SAFETY_TAINTED=1");
    expect(gate.indexOf("m1-log-safety.mjs")).toBeLessThan(
      gate.indexOf('mv -- "${private_log}" "${destination}"'),
    );

    expect(playwrightConfig).not.toContain("import.meta.url");
    expect(playwrightConfig).toContain('parsed.hostname !== "127.0.0.1"');
  });
});
