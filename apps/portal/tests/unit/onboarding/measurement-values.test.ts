import { describe, expect, it } from "vitest";
import { convertMeasurement, formatMeasurement, parseMeasurement } from "../../../src/lib/onboarding/measurement-values";
import { ONBOARDING_QUESTIONS } from "../../../src/lib/contracts/onboarding-definition";
import { EMPTY_ONBOARDING_RESPONSES, onboardingResponsesSchema } from "../../../src/lib/contracts/onboarding";
import { NO_EQUIPMENT_ANSWER, displayOnboardingText } from "../../../src/lib/onboarding/answer-display";

describe("onboarding measurement wheels and backward-compatible answers", () => {
  it.each(["5 ft 10 in", "5 pi 10 po", "5'10\"", "5 pieds 10 pouces"])("parses imperial height %s", (value) => {
    expect(parseMeasurement(value, "height")).toEqual({ amount: 70, unit: "imperial" });
  });
  it("reads metric height and decimal weights with explicit units", () => {
    expect(parseMeasurement("180 cm", "height")).toEqual({ amount: 180, unit: "metric" });
    expect(parseMeasurement("84,5 kg", "weight")).toEqual({ amount: 84.5, unit: "metric" });
    expect(parseMeasurement("185.5 lbs", "weight")).toEqual({ amount: 185.5, unit: "imperial" });
  });
  it("does not guess missing or malformed units in old answers", () => {
    for (const answer of [null, "180", "environ grand", "-2 cm", "0 cm", "5 ft 12 in"]) {
      expect(parseMeasurement(answer, "height")).toBeNull();
    }
    expect(parseMeasurement("185", "weight")).toBeNull();
  });
  it("converts accurately in both directions without mutating the original answer", () => {
    expect(convertMeasurement(70, "height", "imperial", "metric")).toBeCloseTo(177.8, 8);
    expect(convertMeasurement(177.8, "height", "metric", "imperial")).toBeCloseTo(70, 8);
    expect(convertMeasurement(200, "weight", "imperial", "metric")).toBeCloseTo(90.718474, 8);
    expect(convertMeasurement(90.718474, "weight", "metric", "imperial")).toBeCloseTo(200, 8);
    expect(convertMeasurement(84.5, "weight", "metric", "metric")).toBe(84.5);
  });
  it("formats complete imperial units and one weight decimal without invalid twelve-inch values", () => {
    expect(formatMeasurement(71.9, "height", "imperial")).toBe("6 ft 0 in");
    expect(formatMeasurement(179.8, "height", "metric")).toBe("180 cm");
    expect(formatMeasurement(84.51, "weight", "metric")).toBe("84.5 kg");
    expect(formatMeasurement(185, "weight", "imperial")).toBe("185 lb");
  });
  it("keeps unit-bearing measurements, no-equipment and old free text inside the existing contract", () => {
    for (const height of ["5 ft 10 in", "180 cm", "Ancienne réponse à conserver"]) {
      expect(onboardingResponsesSchema.safeParse({ ...EMPTY_ONBOARDING_RESPONSES, height, currentBodyweight: "84.5 kg", availableEquipment: NO_EQUIPMENT_ANSWER }).success).toBe(true);
    }
  });
  it("includes men who are not fathers while preserving the existing question key", () => {
    const question = ONBOARDING_QUESTIONS.find((question) => question.key === "fatherVision");
    expect(question?.label.fr).toBe("Quel homme veux-tu devenir et quel père, si applicable ?");
    expect(question?.label.en).toContain("if applicable");
    expect(question?.required).toBe(true);
  });
  it("localizes only recognized measurement/no-equipment answers, never free text", () => {
    expect(displayOnboardingText("height", "5 ft 10 in", true)).toBe("5 pi 10 po");
    expect(displayOnboardingText("currentBodyweight", "84.5 kg", true)).toBe("84,5 kg");
    expect(displayOnboardingText("height", "5 ft 10 in", false)).toBe("5 ft 10 in");
    expect(displayOnboardingText("availableEquipment", NO_EQUIPMENT_ANSWER, false)).toBe("Not applicable — no equipment at home.");
    expect(displayOnboardingText("availableEquipment", "Description personnelle", false)).toBe("Description personnelle");
  });
});
