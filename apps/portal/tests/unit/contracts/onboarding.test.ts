import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EMPTY_ONBOARDING_RESPONSES,
  completeOnboardingResponsesSchema,
  isOnboardingComplete,
  onboardingResponsesSchema,
  type OnboardingResponses,
} from "@/lib/contracts/onboarding";
import { ONBOARDING_QUESTIONS } from "@/lib/contracts/onboarding-definition";

function completeResponses() {
  const responses = structuredClone(EMPTY_ONBOARDING_RESPONSES) as OnboardingResponses;
  for (const question of ONBOARDING_QUESTIONS) {
    if (!question.required) continue;
    if (question.type === "multi") {
      responses[question.key] = [question.options![0].value];
    } else if (question.type === "single") {
      responses[question.key] = question.options![0].value;
    } else if (question.type === "number" || question.type === "scale") {
      responses[question.key] = question.min ?? 0;
    } else if (question.type === "email") {
      responses[question.key] = "client@example.test";
    } else if (question.type === "tel") {
      responses[question.key] = "+1 514 555 0100";
    } else {
      responses[question.key] = "Réponse complète";
    }
  }
  return responses;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlContractRows(): string {
  return ONBOARDING_QUESTIONS.map((question, index) => {
    const allowedValues = question.options?.length
      ? `array[${question.options.map((option) => sqlLiteral(option.value)).join(", ")}]::text[]`
      : "'{}'::text[]";
    return `  (${[
      sqlLiteral(question.key),
      index + 1,
      sqlLiteral(question.type),
      question.required,
      question.min ?? "null",
      question.max ?? "null",
      question.step ?? "null",
      question.maxLength ?? "null",
      allowedValues,
    ].join(", ")})`;
  }).join(",\n");
}

describe("native onboarding contract", () => {
  it("defines exactly 64 stable keys and source mappings", () => {
    expect(ONBOARDING_QUESTIONS).toHaveLength(64);
    expect(new Set(ONBOARDING_QUESTIONS.map((question) => question.key))).toHaveLength(64);
    expect(new Set(ONBOARDING_QUESTIONS.map((question) => question.sourceId))).toHaveLength(64);
    expect(Object.keys(EMPTY_ONBOARDING_RESPONSES)).toHaveLength(64);
  });

  it("keeps the frozen SQL validator registry identical to the TypeScript definition", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/202609220001_client_onboarding.sql"),
      "utf8",
    );
    expect(migration).toContain(`${sqlContractRows()};`);
  });

  it("uses null or an empty list for every unanswered value", () => {
    for (const question of ONBOARDING_QUESTIONS) {
      expect(EMPTY_ONBOARDING_RESPONSES[question.key]).toEqual(
        question.type === "multi" ? [] : null,
      );
    }
    expect(isOnboardingComplete(EMPTY_ONBOARDING_RESPONSES)).toBe(false);
  });

  it("accepts one valid explicit answer for every required question", () => {
    const responses = completeResponses();
    expect(completeOnboardingResponsesSchema.parse(responses)).toEqual(responses);
    expect(isOnboardingComplete(responses)).toBe(true);
  });

  it("rejects missing, extra, invalid option, duplicate option and invalid numeric values", () => {
    const complete = completeResponses();
    const missing: Partial<OnboardingResponses> = { ...complete };
    delete missing.fullName;
    expect(onboardingResponsesSchema.safeParse(missing).success).toBe(false);
    expect(onboardingResponsesSchema.safeParse({ ...complete, unexpected: "value" }).success).toBe(false);
    expect(
      onboardingResponsesSchema.safeParse({ ...complete, preferredTrainingTime: "INVALID" }).success,
    ).toBe(false);
    expect(
      onboardingResponsesSchema.safeParse({
        ...complete,
        availableDays: ["MONDAY", "MONDAY"],
      }).success,
    ).toBe(false);
    expect(onboardingResponsesSchema.safeParse({ ...complete, confidenceScore: 0 }).success).toBe(
      false,
    );
  });

  it("keeps contact answers ordinary response data", () => {
    const responses = completeResponses();
    responses.fullName = "Nom libre saisi";
    responses.email = "different@example.test";
    expect(onboardingResponsesSchema.parse(responses)).toMatchObject({
      fullName: "Nom libre saisi",
      email: "different@example.test",
    });
  });

  it("accepts the longest valid Client identity values when prefilling", () => {
    const responses = structuredClone(EMPTY_ONBOARDING_RESPONSES) as OnboardingResponses;
    responses.fullName = `${"a".repeat(120)} ${"b".repeat(120)}`;
    responses.email = `${"a".repeat(307)}@example.test`;

    expect(Array.from(responses.fullName).length).toBe(241);
    expect(Array.from(responses.email).length).toBe(320);
    expect(onboardingResponsesSchema.safeParse(responses).success).toBe(true);
  });

  it("uses Unicode characters, not UTF-16 code units, for text limits", () => {
    const responses = completeResponses();
    responses.whyNow = "💪".repeat(1_500);
    expect(onboardingResponsesSchema.safeParse(responses).success).toBe(true);
    responses.whyNow = "💪".repeat(1_501);
    expect(onboardingResponsesSchema.safeParse(responses).success).toBe(false);
  });

  it("rejects whitespace-only answers and malformed dot-atoms", () => {
    const complete = completeResponses();
    expect(onboardingResponsesSchema.safeParse({ ...complete, whyNow: "\n\t" }).success).toBe(
      false,
    );
    expect(
      onboardingResponsesSchema.safeParse({ ...complete, email: "a..b@example.test" }).success,
    ).toBe(false);
    expect(
      onboardingResponsesSchema.safeParse({ ...complete, email: ".ab@example.test" }).success,
    ).toBe(false);
  });
});
