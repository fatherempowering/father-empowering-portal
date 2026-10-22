import { describe, expect, it } from "vitest";

import { ONBOARDING_QUESTIONS } from "@/lib/contracts/onboarding-definition";
import {
  displayOnboardingAnswer,
  onboardingPresentationSections,
} from "./onboarding-presentation";

function question(key: (typeof ONBOARDING_QUESTIONS)[number]["key"]) {
  const value = ONBOARDING_QUESTIONS.find((item) => item.key === key);
  if (!value) throw new Error(`Missing test definition for ${key}`);
  return value;
}

describe("Coach onboarding presentation", () => {
  it("keeps the six canonical sections and all 64 questions in order", () => {
    const sections = onboardingPresentationSections({});

    expect(sections).toHaveLength(6);
    expect(sections.reduce((count, section) => count + section.items.length, 0)).toBe(64);
    expect(sections.map((section) => section.title)).toEqual([
      "Informations personnelles",
      "Objectifs et vision",
      "Entraînement et équipement",
      "Santé et récupération",
      "Habitudes alimentaires",
      "Soutien et engagement",
    ]);
  });

  it("presents scales and numeric answers with explicit units", () => {
    expect(displayOnboardingAnswer(question("commitmentScore"), 8, "fr")).toBe(
      "8 / 10",
    );
    expect(displayOnboardingAnswer(question("trainingYears"), 1.5, "fr")).toBe(
      "1,5 ans",
    );
    expect(displayOnboardingAnswer(question("sleepHours"), 7.25, "fr")).toBe(
      "7,25 h par nuit",
    );
    expect(
      displayOnboardingAnswer(question("realisticTrainingDays"), 4, "fr"),
    ).toBe("4 jours par semaine");
  });

  it("uses localized labels for single and multiple choices", () => {
    expect(displayOnboardingAnswer(question("doesCardio"), "YES", "fr")).toBe(
      "Oui",
    );
    expect(
      displayOnboardingAnswer(
        question("availableDays"),
        ["MONDAY", "SATURDAY"],
        "fr",
      ),
    ).toBe("Lundi, Samedi");
    expect(
      displayOnboardingAnswer(question("preferredTrainingTime"), "EVENING", "en"),
    ).toBe("Evening");
  });

  it("never exposes an unknown stored option or missing value as raw data", () => {
    expect(displayOnboardingAnswer(question("doesCardio"), "UNKNOWN", "fr")).toBe(
      "Réponse indisponible",
    );
    expect(displayOnboardingAnswer(question("cardioDetails"), null, "fr")).toBe(
      "Non renseigné",
    );
  });
});
