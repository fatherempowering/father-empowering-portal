import { execFileSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve(process.argv[2] ?? "artifacts/m1-gate/supabase.env");
const workdir = process.env.SUPABASE_WORKDIR;
if (!workdir) throw new Error("SUPABASE_WORKDIR is required.");

let status;
try {
  const raw = execFileSync(
    "pnpm",
    [
      "--filter",
      "@father-empowering/portal",
      "exec",
      "supabase",
      "status",
      "--workdir",
      workdir,
      "-o",
      "json",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  status = JSON.parse(raw);
} catch {
  // Never attach the child-process error: Node includes captured stdout in it,
  // and Supabase status output contains disposable local credentials.
  throw new Error("Unable to read local Supabase status safely.");
}

const apiUrl = status.API_URL ?? status.api_url;
const anonKey = status.ANON_KEY ?? status.anon_key;
const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
const inbucketUrl = status.INBUCKET_URL ?? status.inbucket_url;
const appUrlInput = process.env.M1_APP_URL ?? "http://127.0.0.1:3000";

function canonicalLoopbackOrigin(value, port) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      parsed.port !== port ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("non-canonical URL");
    }
    return parsed.origin;
  } catch {
    throw new Error("Refusing non-canonical local URL in the M1 test harness.");
  }
}

const appUrl = canonicalLoopbackOrigin(appUrlInput, "3000");
const localApiUrl = canonicalLoopbackOrigin(apiUrl, "54321");
const localMailpitUrl = canonicalLoopbackOrigin(inbucketUrl, "54324");

for (const [name, value] of Object.entries({ anonKey, serviceRoleKey })) {
  if (typeof value !== "string" || value.length < 1) {
    throw new Error(`Missing local Supabase value: ${name}`);
  }
}

function shellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: localApiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  NEXT_PUBLIC_APP_URL: appUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  M1_TEST_SUPABASE_URL: localApiUrl,
  M1_TEST_SUPABASE_ANON_KEY: anonKey,
  M1_TEST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  M1_TEST_INBUCKET_URL: localMailpitUrl,
  M1_TEST_SMTP_HOST: "127.0.0.1",
  M1_TEST_SMTP_PORT: "54325",
  M1_TEST_EMAIL_TRANSPORT: "mailpit",
  M1_EMAIL_TRANSPORT: "smtp",
  OUTBOX_WORKER_SECRET: "m1-local-worker-secret-not-for-production",
  INVITATION_TOKEN_SECRET: "m1-local-invitation-token-secret-32-characters-minimum",
  INVITATION_EMAIL_FROM: "Father Empowering <portal@example.test>",
};

writeFileSync(
  outputPath,
  `${Object.entries(values)
    .map(([name, value]) => `${name}=${shellValue(value)}`)
    .join("\n")}\n`,
  { mode: 0o600 },
);
chmodSync(outputPath, 0o600);
