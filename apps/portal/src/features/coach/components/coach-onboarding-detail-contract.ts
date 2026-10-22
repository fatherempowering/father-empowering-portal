import { z } from "zod";

import {
  emailSchema,
  localeSchema,
  timeZoneSchema,
  uuidSchema,
} from "@/lib/contracts/m1";
import { coachOnboardingSnapshotSchema } from "@/lib/contracts/onboarding";

export const coachOnboardingDetailSchema = z
  .object({
    client: z
      .object({
        id: uuidSchema,
        displayName: z.string().trim().min(1).max(241),
        email: emailSchema,
        locale: localeSchema,
        timezone: timeZoneSchema,
      })
      .strict(),
    intake: coachOnboardingSnapshotSchema,
  })
  .strict();

export type CoachOnboardingDetailValue = z.infer<
  typeof coachOnboardingDetailSchema
>;

const apiErrorSchema = z
  .object({
    code: z.string().optional(),
  });

export type CoachOnboardingApiEnvelope = Readonly<{
  data: CoachOnboardingDetailValue | null;
  error: z.infer<typeof apiErrorSchema> | null;
}>;

export function parseCoachOnboardingApiEnvelope(
  value: unknown,
  expectedClientId: string,
): CoachOnboardingApiEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { data: null, error: null };
  }

  const envelope = value as Record<string, unknown>;
  const parsedData = coachOnboardingDetailSchema.safeParse(envelope.data);
  const parsedError = apiErrorSchema.safeParse(
    typeof envelope.error === "object" && envelope.error !== null
      ? envelope.error
      : undefined,
  );
  const data =
    parsedData.success && parsedData.data.client.id === expectedClientId
      ? parsedData.data
      : null;

  return {
    data,
    error: parsedError.success ? parsedError.data : null,
  };
}
