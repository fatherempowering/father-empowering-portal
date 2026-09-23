import {
  ONBOARDING_SECTIONS,
  type OnboardingQuestion,
  type OnboardingQuestionKey,
} from "@/lib/contracts/onboarding-definition";
import type {
  OnboardingResponses,
  OnboardingResponseValue,
} from "@/lib/contracts/onboarding";

export type OnboardingLanguage = "fr" | "en";

export type OnboardingPresentationSection = Readonly<{
  id: string;
  title: string;
  description: string;
  items: ReadonlyArray<
    Readonly<{
      key: OnboardingQuestionKey;
      label: string;
      value: string;
      wide: boolean;
    }>
  >;
}>;

const missingCopy = {
  fr: "Non renseigné",
  en: "Not provided",
} as const;

const unavailableCopy = {
  fr: "Réponse indisponible",
  en: "Response unavailable",
} as const;

function formatNumber(value: number, language: OnboardingLanguage): string {
  return new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumberAnswer(
  key: OnboardingQuestionKey,
  value: number,
  language: OnboardingLanguage,
): string {
  const number = formatNumber(value, language);
  if (key === "trainingYears") {
    return language === "fr"
      ? `${number} ${value === 1 ? "an" : "ans"}`
      : `${number} ${value === 1 ? "year" : "years"}`;
  }
  if (key === "currentTrainingDays" || key === "realisticTrainingDays") {
    return language === "fr"
      ? `${number} ${value === 1 ? "jour" : "jours"} par semaine`
      : `${number} ${value === 1 ? "day" : "days"} per week`;
  }
  if (key === "sleepHours") {
    return language === "fr"
      ? `${number} h par nuit`
      : `${number} hr per night`;
  }
  if (key === "mealsPerDay") {
    return language === "fr"
      ? `${number} repas par jour`
      : `${number} ${value === 1 ? "meal" : "meals"} per day`;
  }
  return number;
}

function optionLabel(
  question: OnboardingQuestion,
  value: string,
  language: OnboardingLanguage,
): string | null {
  return (
    question.options?.find((option) => option.value === value)?.label[
      language
    ] ?? null
  );
}

export function displayOnboardingAnswer(
  question: OnboardingQuestion,
  value: OnboardingResponseValue | undefined,
  language: OnboardingLanguage,
): string {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return missingCopy[language];
  }

  if (question.type === "single") {
    if (typeof value !== "string") return unavailableCopy[language];
    return optionLabel(question, value, language) ?? unavailableCopy[language];
  }

  if (question.type === "multi") {
    if (!Array.isArray(value)) return unavailableCopy[language];
    const labels = value.map((item) => optionLabel(question, item, language));
    if (labels.some((label) => label === null)) return unavailableCopy[language];
    return labels.join(", ");
  }

  if (question.type === "scale") {
    if (typeof value !== "number") return unavailableCopy[language];
    return `${formatNumber(value, language)} / ${question.max ?? 10}`;
  }

  if (question.type === "number") {
    if (typeof value !== "number") return unavailableCopy[language];
    return formatNumberAnswer(question.key, value, language);
  }

  return typeof value === "string" ? value : unavailableCopy[language];
}

export function onboardingPresentationSections(
  responses: Partial<OnboardingResponses>,
  language: OnboardingLanguage = "fr",
): OnboardingPresentationSection[] {
  return ONBOARDING_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title[language],
    description: section.description[language],
    items: section.questions.map((question) => ({
      key: question.key,
      label: question.label[language],
      value: displayOnboardingAnswer(
        question,
        responses[question.key],
        language,
      ),
      wide: question.type === "textarea",
    })),
  }));
}
