import { z } from "zod";

import {
  emailSchema,
  localeSchema,
  shortTextSchema,
  timeZoneSchema,
  uuidSchema,
} from "@/lib/contracts/m1";
import { coachInitialAssessmentSnapshotSchema } from "@/lib/contracts/week-zero";

export const coachClientWeekZeroSchema = z
  .object({
    client: z
      .object({
        id: uuidSchema,
        displayName: shortTextSchema,
        email: emailSchema,
        locale: localeSchema,
        timezone: timeZoneSchema,
      })
      .strict(),
    assessment: coachInitialAssessmentSnapshotSchema,
  })
  .strict();

export type CoachClientWeekZero = z.infer<typeof coachClientWeekZeroSchema>;

const apiErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type CoachClientApiEnvelope = Readonly<{
  data: CoachClientWeekZero | null;
  error: z.infer<typeof apiErrorSchema> | null;
}>;

export function parseCoachClientApiEnvelope(
  value: unknown,
): CoachClientApiEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { data: null, error: null };
  }

  const envelope = value as Record<string, unknown>;
  const data = coachClientWeekZeroSchema.safeParse(envelope.data);
  const error = apiErrorSchema.safeParse(
    typeof envelope.error === "object" && envelope.error !== null
      ? envelope.error
      : undefined,
  );

  return {
    data: data.success ? data.data : null,
    error: error.success ? error.data : null,
  };
}
