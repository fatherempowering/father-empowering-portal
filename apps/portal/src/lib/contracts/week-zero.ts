import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";

export const PAIN_ANSWERS = ["NOT_ASSESSED", "NO", "YES"] as const;
export const painAnswerSchema = z.enum(PAIN_ANSWERS);
export type PainAnswer = z.infer<typeof painAnswerSchema>;

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export const weekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof weekdaySchema>;

export const INITIAL_ASSESSMENT_KIND = "INITIAL_ASSESSMENT" as const;
export const INITIAL_ASSESSMENT_SCHEMA_VERSION = 1 as const;
export const INITIAL_ASSESSMENT_STATUSES = ["NOT_STARTED", "DRAFT", "SUBMITTED"] as const;
export const initialAssessmentStatusSchema = z.enum(INITIAL_ASSESSMENT_STATUSES);
export type InitialAssessmentStatus = z.infer<typeof initialAssessmentStatusSchema>;

const optionalText = (maximumLength: number) =>
  z.string().trim().max(maximumLength).nullable();

const optionalInches = z.number().finite().positive().max(200).nullable();

export const initialAssessmentResponsesSchema = z
  .object({
    measurements: z
      .object({
        bodyWeightLb: z.number().finite().positive().max(1_500).nullable(),
        waistIn: optionalInches,
        chestIn: optionalInches,
        hipsIn: optionalInches,
        rightArmIn: optionalInches,
        rightThighIn: optionalInches,
        other: optionalText(1_000),
      })
      .strict(),
    mobility: z
      .object({
        painSquat: painAnswerSchema,
        painHinge: painAnswerSchema,
        painPush: painAnswerSchema,
        painPull: painAnswerSchema,
        painCardio: painAnswerSchema,
        limitedMovement: optionalText(1_000),
        comfortableMovement: optionalText(1_000),
        tightArea: optionalText(1_000),
      })
      .strict(),
    availability: z
      .object({
        days: z
          .array(weekdaySchema)
          .max(WEEKDAYS.length)
          .refine((days) => new Set(days).size === days.length, "Availability days must be unique"),
        bestTime: optionalText(120),
        sessionDurationMinutes: z.number().int().min(1).max(480).nullable(),
        sessionsPerWeek: z.number().int().min(1).max(7).nullable(),
        constraints: optionalText(1_000),
      })
      .strict(),
  })
  .strict();
export type InitialAssessmentResponses = z.infer<typeof initialAssessmentResponsesSchema>;

export const EMPTY_INITIAL_ASSESSMENT_RESPONSES: InitialAssessmentResponses = {
  measurements: {
    bodyWeightLb: null,
    waistIn: null,
    chestIn: null,
    hipsIn: null,
    rightArmIn: null,
    rightThighIn: null,
    other: null,
  },
  mobility: {
    painSquat: "NOT_ASSESSED",
    painHinge: "NOT_ASSESSED",
    painPush: "NOT_ASSESSED",
    painPull: "NOT_ASSESSED",
    painCardio: "NOT_ASSESSED",
    limitedMovement: null,
    comfortableMovement: null,
    tightArea: null,
  },
  availability: {
    days: [],
    bestTime: null,
    sessionDurationMinutes: null,
    sessionsPerWeek: null,
    constraints: null,
  },
};

const explicitPainAnswerSchema = z.enum(["NO", "YES"]);

export const completeInitialAssessmentResponsesSchema = initialAssessmentResponsesSchema.superRefine(
  (responses, context) => {
    if (responses.measurements.bodyWeightLb === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["measurements", "bodyWeightLb"],
        message: "Body weight is required before submission.",
      });
    }
    if (responses.measurements.waistIn === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["measurements", "waistIn"],
        message: "Waist measurement is required before submission.",
      });
    }

    const painFields = ["painSquat", "painHinge", "painPush", "painPull", "painCardio"] as const;
    for (const field of painFields) {
      if (!explicitPainAnswerSchema.safeParse(responses.mobility[field]).success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mobility", field],
          message: "An explicit pain answer is required before submission.",
        });
      }
    }

    const mobilityNotes = ["limitedMovement", "comfortableMovement", "tightArea"] as const;
    for (const field of mobilityNotes) {
      if (!responses.mobility[field]?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mobility", field],
          message: "A mobility answer is required before submission.",
        });
      }
    }
  },
);

export const saveInitialAssessmentRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
    responses: initialAssessmentResponsesSchema,
  })
  .strict();
export type SaveInitialAssessmentRequest = z.infer<typeof saveInitialAssessmentRequestSchema>;

export const submitInitialAssessmentRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
  })
  .strict();
export type SubmitInitialAssessmentRequest = z.infer<typeof submitInitialAssessmentRequestSchema>;

export const initialAssessmentSnapshotSchema = z
  .object({
    kind: z.literal(INITIAL_ASSESSMENT_KIND),
    schemaVersion: z.literal(INITIAL_ASSESSMENT_SCHEMA_VERSION),
    status: initialAssessmentStatusSchema,
    version: z.number().int().nonnegative(),
    responses: initialAssessmentResponsesSchema,
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type InitialAssessmentSnapshot = z.infer<typeof initialAssessmentSnapshotSchema>;

export const coachInitialAssessmentSnapshotSchema = z
  .object({
    kind: z.literal(INITIAL_ASSESSMENT_KIND),
    schemaVersion: z.literal(INITIAL_ASSESSMENT_SCHEMA_VERSION),
    status: z.enum(["NOT_SUBMITTED", "SUBMITTED"]),
    version: z.number().int().nonnegative(),
    responses: initialAssessmentResponsesSchema.nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type CoachInitialAssessmentSnapshot = z.infer<typeof coachInitialAssessmentSnapshotSchema>;

export function isInitialAssessmentComplete(responses: InitialAssessmentResponses): boolean {
  return completeInitialAssessmentResponsesSchema.safeParse(responses).success;
}
