import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const invitationDeliveryCommonSchema = serverEnvironmentSchema.extend({
  INVITATION_TOKEN_SECRET: z.string().min(32),
  INVITATION_EMAIL_FROM: z.string().min(3),
});

const invitationDeliveryEnvironmentSchema = z.discriminatedUnion("M1_EMAIL_TRANSPORT", [
  invitationDeliveryCommonSchema.extend({
    M1_EMAIL_TRANSPORT: z.literal("resend"),
    RESEND_API_KEY: z.string().min(1),
  }),
  invitationDeliveryCommonSchema.extend({
    M1_EMAIL_TRANSPORT: z.literal("smtp"),
    M1_TEST_SMTP_HOST: z.enum(["127.0.0.1", "localhost"]),
    M1_TEST_SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  }),
]);

export function getPublicEnvironment() {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function getServerEnvironment() {
  return serverEnvironmentSchema.parse({
    ...getPublicEnvironment(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function getInvitationDeliveryEnvironment() {
  return invitationDeliveryEnvironmentSchema.parse({
    ...getServerEnvironment(),
    INVITATION_TOKEN_SECRET: process.env.INVITATION_TOKEN_SECRET,
    M1_EMAIL_TRANSPORT: process.env.M1_EMAIL_TRANSPORT ?? "resend",
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    INVITATION_EMAIL_FROM: process.env.INVITATION_EMAIL_FROM,
    M1_TEST_SMTP_HOST: process.env.M1_TEST_SMTP_HOST,
    M1_TEST_SMTP_PORT: process.env.M1_TEST_SMTP_PORT,
  });
}

export function getOutboxWorkerEnvironment() {
  return {
    ...getInvitationDeliveryEnvironment(),
    OUTBOX_WORKER_SECRET: z.string().min(32).parse(process.env.OUTBOX_WORKER_SECRET),
  };
}
