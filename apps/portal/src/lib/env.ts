import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const invitationDeliveryEnvironmentSchema = serverEnvironmentSchema.extend({
  INVITATION_TOKEN_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  INVITATION_EMAIL_FROM: z.string().min(3),
});

const outboxWorkerEnvironmentSchema = invitationDeliveryEnvironmentSchema.extend({
  OUTBOX_WORKER_SECRET: z.string().min(32),
});

export function getPublicEnvironment() {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    INVITATION_EMAIL_FROM: process.env.INVITATION_EMAIL_FROM,
  });
}

export function getOutboxWorkerEnvironment() {
  return outboxWorkerEnvironmentSchema.parse({
    ...getInvitationDeliveryEnvironment(),
    OUTBOX_WORKER_SECRET: process.env.OUTBOX_WORKER_SECRET,
  });
}
