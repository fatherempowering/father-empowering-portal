import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";
import {
  ONBOARDING_QUESTIONS,
  type OnboardingQuestion,
  type OnboardingQuestionKey,
} from "@/lib/contracts/onboarding-definition";

export const ONBOARDING_KIND = "ONBOARDING_INTAKE" as const;
export const ONBOARDING_SCHEMA_VERSION = 1 as const;
export const ONBOARDING_STATUSES = ["NOT_STARTED", "DRAFT", "SUBMITTED"] as const;
export const onboardingStatusSchema = z.enum(ONBOARDING_STATUSES);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export type OnboardingResponseValue = string | number | string[] | null;
export type OnboardingResponses = Record<OnboardingQuestionKey, OnboardingResponseValue>;

function questionResponseSchema(question: OnboardingQuestion): z.ZodType<OnboardingResponseValue> {
  if (question.type === "multi") {
    const allowed = new Set((question.options ?? []).map((option) => option.value));
    return z
      .array(z.string())
      .max(allowed.size)
      .refine((values) => new Set(values).size === values.length, "Selections must be unique")
      .refine((values) => values.every((value) => allowed.has(value)), "Invalid selection");
  }
  if (question.type === "single") {
    const allowed = new Set((question.options ?? []).map((option) => option.value));
    return z.string().refine((value) => allowed.has(value), "Invalid selection").nullable();
  }
  if (question.type === "number" || question.type === "scale") {
    let numberSchema = z.number().finite();
    if (question.min !== undefined) numberSchema = numberSchema.min(question.min);
    if (question.max !== undefined) numberSchema = numberSchema.max(question.max);
    if (question.step !== undefined) numberSchema = numberSchema.multipleOf(question.step);
    return numberSchema.nullable();
  }

  const maximumLength = question.maxLength ?? 1_500;
  let stringSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => Array.from(value).length <= maximumLength,
      `Response must contain at most ${maximumLength} Unicode characters`,
    );
  if (question.type === "email") stringSchema = stringSchema.email();
  return stringSchema.nullable();
}

const responseShape = Object.fromEntries(
  ONBOARDING_QUESTIONS.map((question) => [question.key, questionResponseSchema(question)]),
) as Record<OnboardingQuestionKey, z.ZodType<OnboardingResponseValue>>;

export const onboardingResponsesSchema = z.object(responseShape).strict();

export const EMPTY_ONBOARDING_RESPONSES = Object.freeze(
  Object.fromEntries(
    ONBOARDING_QUESTIONS.map((question) => [question.key, question.type === "multi" ? [] : null]),
  ) as OnboardingResponses,
);

export const completeOnboardingResponsesSchema = onboardingResponsesSchema.superRefine(
  (responses, context) => {
    for (const question of ONBOARDING_QUESTIONS) {
      if (!question.required) continue;
      const value = responses[question.key];
      if (
        value === null
        || (typeof value === "string" && value.trim() === "")
        || (Array.isArray(value) && value.length === 0)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [question.key],
          message: "A required onboarding response is missing.",
        });
      }
    }
  },
);

export const saveOnboardingRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
    responses: onboardingResponsesSchema,
  })
  .strict();
export type SaveOnboardingRequest = z.infer<typeof saveOnboardingRequestSchema>;

export const submitOnboardingRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
  })
  .strict();
export type SubmitOnboardingRequest = z.infer<typeof submitOnboardingRequestSchema>;

export const onboardingSnapshotSchema = z
  .object({
    kind: z.literal(ONBOARDING_KIND),
    schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
    status: onboardingStatusSchema,
    version: z.number().int().nonnegative(),
    responses: onboardingResponsesSchema,
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type OnboardingSnapshot = z.infer<typeof onboardingSnapshotSchema>;

export const coachOnboardingSnapshotSchema = z
  .object({
    kind: z.literal(ONBOARDING_KIND),
    schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
    status: z.enum(["NOT_SUBMITTED", "SUBMITTED"]),
    version: z.number().int().nonnegative(),
    responses: onboardingResponsesSchema.nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type CoachOnboardingSnapshot = z.infer<typeof coachOnboardingSnapshotSchema>;

export function isOnboardingComplete(responses: OnboardingResponses): boolean {
  return completeOnboardingResponsesSchema.safeParse(responses).success;
}
