import { describe, expect, it } from "vitest";

import type { InitialAssessmentResponses } from "@/lib/contracts/week-zero";
import {
  assessmentSections,
  displayPain,
  displayValue,
  displayWeekdays,
  formatAssessmentDate,
} from "./initial-assessment-presentation";

const responses: InitialAssessmentResponses = {
  measurements: {
    bodyWeightLb: 187.5,
    waistIn: 34.25,
    chestIn: null,
    hipsIn: 39,
    rightArmIn: 15.5,
    rightThighIn: 24,
    other: "Mesuré au réveil.",
  },
  mobility: {
    painSquat: "YES",
    painHinge: "NO",
    painPush: "NOT_ASSESSED",
    painPull: "NO",
    painCardio: "NO",
    limitedMovement: "Squat profond",
    comfortableMovement: "Tirage horizontal",
    tightArea: "Cheville droite",
  },
  availability: {
    days: ["MONDAY", "WEDNESDAY", "SATURDAY"],
    bestTime: "Avant 7 h",
    sessionDurationMinutes: 45,
    sessionsPerWeek: 3,
    constraints: null,
  },
};

describe("Coach initial assessment presentation", () => {
  it("keeps missing, negative pain and unassessed values distinct", () => {
    expect(displayValue(null)).toBe("Non renseigné");
    expect(displayPain("YES")).toBe("Oui");
    expect(displayPain("NO")).toBe("Non");
    expect(displayPain("NOT_ASSESSED")).toBe("Non évalué");
  });

  it("formats availability without inventing missing values", () => {
    expect(displayWeekdays(responses.availability.days)).toBe(
      "Lundi, Mercredi, Samedi",
    );
    expect(displayWeekdays([])).toBe("Non renseigné");
  });

  it("presents every submitted section with explicit units", () => {
    const sections = assessmentSections(responses);

    expect(sections.map((section) => section.title)).toEqual([
      "Mesures",
      "Mobilité et douleur",
      "Disponibilités",
    ]);
    expect(sections[0].items).toContainEqual({
      label: "Poids corporel",
      value: "187.5 lb",
    });
    expect(sections[0].items).toContainEqual({
      label: "Poitrine",
      value: "Non renseigné",
    });
    expect(sections[2].items).toContainEqual({
      label: "Durée possible par séance",
      value: "45 min",
    });
  });

  it("formats transmission time in the client timezone and rejects invalid dates", () => {
    expect(
      formatAssessmentDate("2026-09-21T02:30:00Z", "America/Toronto"),
    ).toContain("2026");
    expect(formatAssessmentDate("not-a-date", "America/Toronto")).toBeNull();
  });
});
