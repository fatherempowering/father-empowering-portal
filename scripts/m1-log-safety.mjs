import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

const inputPath = process.argv[2];

const unsafePatterns = [
  /[?#&]token=[A-Za-z0-9_-]{32,}/i,
  /["']?(?:otp|invitationToken|opaqueToken|rawToken)["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{6,}/i,
  /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?:$|[^A-Za-z0-9_-])/,
  /(?:^|[^A-Za-z0-9])[0-9]{6}(?:$|[^A-Za-z0-9])/,
  /(?:^|[^0-9])[0-9]{3}[\s-][0-9]{3}(?:$|[^0-9])/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /\botpauth:\/\//i,
  /\bsecret=[A-Z2-7]{16,}/i,
  /(?:^|[^A-Z2-7])[A-Z2-7]{24,}(?:$|[^A-Z2-7])/,
  /\bsb-[A-Za-z0-9_-]+-auth-token\b/i,
  /\bM1-local-only-[^\s"']+/,
];

const exactSecrets = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_ANON_KEY,
  process.env.M1_TEST_SUPABASE_SERVICE_ROLE_KEY,
  process.env.M1_TEST_SUPABASE_ANON_KEY,
  process.env.INVITATION_TOKEN_SECRET,
  process.env.OUTBOX_WORKER_SECRET,
].filter((value) => typeof value === "string" && value.length > 0);

const ansiEscape = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

function containsSecret(value) {
  const normalized = value.replaceAll(ansiEscape, "");
  const folded = normalized.replaceAll(/[\r\n]+[ \t]*/g, "");
  // Scan the raw value as well: OSC 8 terminal hyperlinks can carry the
  // bearer in their control-sequence payload while displaying neutral text.
  return [value, normalized, folded].some(
    (candidate) =>
      unsafePatterns.some((pattern) => pattern.test(candidate)) ||
      exactSecrets.some((secret) => candidate.includes(secret)),
  );
}

async function scanFile(path) {
  const input = createReadStream(path, { encoding: "utf8" });
  let tail = "";

  for await (const chunk of input) {
    const window = `${tail}${chunk}`;
    if (containsSecret(window)) return false;
    // Retain enough source (including incomplete ANSI/newline sequences) to
    // catch any M1 secret split across stream chunks without buffering a log.
    tail = window.slice(-2_048);
  }
  return !containsSecret(tail);
}

async function* regularFiles(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) throw new Error("symbolic links are not scannable");
  if (metadata.isFile()) {
    yield path;
    return;
  }
  if (!metadata.isDirectory()) throw new Error("unsupported artifact type");

  const entries = await readdir(path);
  entries.sort();
  for (const entry of entries) {
    yield* regularFiles(join(path, entry));
  }
}

async function scan() {
  if (!inputPath) throw new Error("missing path");
  for await (const path of regularFiles(inputPath)) {
    if (!(await scanFile(path))) return false;
  }
  return true;
}

try {
  if (!(await scan())) {
    process.stderr.write("UNSAFE: sensitive M1 command output was withheld.\n");
    process.exitCode = 1;
  }
} catch {
  process.stderr.write("UNSAFE: the M1 command output could not be scanned safely.\n");
  process.exitCode = 2;
}
