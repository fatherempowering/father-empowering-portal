import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";

export type M1TestEnvironment = Readonly<{
  appUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
}>;

export type SeededStaff = Readonly<{
  userId: string;
  organizationId: string;
  email: string;
  password: string;
  role: "ADMIN" | "COACH";
}>;

type CookieValue = Readonly<{ name: string; value: string }>;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`BLOCKED: missing local M1 test variable ${name}`);
  return value;
}

function localHttpUrl(name: string): string {
  const value = required(name);
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`BLOCKED: ${name} must point to loopback HTTP, received ${value}`);
  }
  return parsed.origin;
}

export function getM1TestEnvironment(): M1TestEnvironment {
  return {
    appUrl: localHttpUrl("M1_APP_URL"),
    supabaseUrl: localHttpUrl("M1_TEST_SUPABASE_URL"),
    anonKey: required("M1_TEST_SUPABASE_ANON_KEY"),
    serviceRoleKey: required("M1_TEST_SUPABASE_SERVICE_ROLE_KEY"),
    mailpitUrl: localHttpUrl("M1_TEST_INBUCKET_URL"),
  };
}

export function createM1AdminClient(environment: M1TestEnvironment): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export async function seedStaffIdentity(
  environment: M1TestEnvironment,
  input: { email: string; password: string; role: "ADMIN" | "COACH" },
): Promise<SeededStaff> {
  const admin = createM1AdminClient(environment);
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: { m1_test_fixture: true },
  });
  if (created.error || !created.data.user) {
    throw new Error(`Unable to seed M1 Auth user: ${created.error?.message ?? "unknown"}`);
  }

  const userId = created.data.user.id;
  const organizationId = randomUUID();

  const organization = await admin.from("organizations").insert({
    id: organizationId,
    name: `M1 ${input.role} ${input.email}`,
    locale: "fr-CA",
    default_time_zone: "America/Montreal",
    status: "ACTIVE",
    created_by: userId,
  });
  if (organization.error) throw organization.error;

  const profile = await admin.from("profiles").insert({
    auth_user_id: userId,
    display_name: input.role === "COACH" ? "Max M1" : "Admin M1",
    locale: "fr-CA",
    time_zone: "America/Montreal",
    status: "ACTIVE",
    created_by: userId,
  });
  if (profile.error) throw profile.error;

  const membership = await admin.from("organization_memberships").insert({
    organization_id: organizationId,
    user_id: userId,
    role: input.role,
    status: "ACTIVE",
    activated_at: new Date().toISOString(),
    created_by: userId,
  });
  if (membership.error) throw membership.error;

  return { userId, organizationId, ...input };
}

export class M1SsrSession {
  readonly client;
  private readonly cookies = new Map<string, string>();

  constructor(environment: M1TestEnvironment) {
    this.client = createServerClient(environment.supabaseUrl, environment.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
      },
      cookies: {
        getAll: async () =>
          [...this.cookies].map(([name, value]) => ({ name, value } satisfies CookieValue)),
        setAll: async (values) => {
          for (const value of values) {
            if (value.value) this.cookies.set(value.name, value.value);
            else this.cookies.delete(value.name);
          }
        },
      },
    });
  }

  cookieHeader(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

export async function enrollAndVerifyTotp(session: M1SsrSession): Promise<string> {
  const enrollment = await session.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `M1-${randomUUID()}`,
  });
  if (enrollment.error || !enrollment.data.totp.secret) {
    throw new Error(`Unable to enroll local TOTP: ${enrollment.error?.message ?? "unknown"}`);
  }

  const secret = enrollment.data.totp.secret;
  const challenge = await session.client.auth.mfa.challenge({ factorId: enrollment.data.id });
  if (challenge.error) throw challenge.error;

  const verification = await session.client.auth.mfa.verify({
    factorId: enrollment.data.id,
    challengeId: challenge.data.id,
    code: currentTotp(secret),
  });
  if (verification.error) throw verification.error;
  return secret;
}

export function currentTotp(secret: string, now = Date.now()): string {
  const normalized = secret.toUpperCase().replaceAll(/[^A-Z2-7]/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of normalized) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid base32 TOTP secret");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function authenticatedFetch(
  environment: M1TestEnvironment,
  session: M1SsrSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", session.cookieHeader());
  headers.set("origin", environment.appUrl);
  return fetch(new URL(path, environment.appUrl), { ...init, headers, redirect: "manual" });
}
