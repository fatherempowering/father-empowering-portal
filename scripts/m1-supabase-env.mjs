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
const databaseUrl = status.DB_URL ?? status.db_url;
const inbucketUrl = status.INBUCKET_URL ?? status.inbucket_url;

if (
  typeof apiUrl !== "string" ||
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(apiUrl)
) {
  throw new Error("Refusing non-local Supabase API URL in the M1 test harness.");
}

for (const [name, value] of Object.entries({ anonKey, serviceRoleKey, databaseUrl })) {
  if (typeof value !== "string" || value.length < 1) {
    throw new Error(`Missing local Supabase value: ${name}`);
  }
}

if (
  typeof inbucketUrl !== "string" ||
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(inbucketUrl)
) {
  throw new Error("Refusing non-local Supabase mail URL in the M1 test harness.");
}

function shellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  NEXT_PUBLIC_APP_URL: process.env.M1_APP_URL ?? "http://127.0.0.1:3000",
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  M1_TEST_DATABASE_URL: databaseUrl,
  M1_TEST_SUPABASE_URL: apiUrl,
  M1_TEST_SUPABASE_ANON_KEY: anonKey,
  M1_TEST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  M1_TEST_INBUCKET_URL: inbucketUrl,
  M1_TEST_SMTP_HOST: "127.0.0.1",
  M1_TEST_SMTP_PORT: "54325",
  M1_TEST_EMAIL_TRANSPORT: "mailpit",
  M1_EMAIL_TRANSPORT: "smtp",
  OUTBOX_WORKER_SECRET: "m1-local-worker-secret-not-for-production",
  INVITATION_TOKEN_SECRET: "m1-local-invitation-token-secret-32-characters-minimum",
  INVITATION_EMAIL_FROM: "Father Empowering <portal@example.test>",
  M1_APP_URL: process.env.M1_APP_URL ?? "http://127.0.0.1:3000",
};

writeFileSync(
  outputPath,
  `${Object.entries(values)
    .map(([name, value]) => `${name}=${shellValue(value)}`)
    .join("\n")}\n`,
  { mode: 0o600 },
);
chmodSync(outputPath, 0o600);
