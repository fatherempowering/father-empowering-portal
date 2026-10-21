import { describe, expect, it } from "vitest";

import { calculateConcept2Result, deriveWeekZeroAcquisition } from "@/lib/week-zero/concept2";
import { EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES } from "@/lib/contracts/week-zero-acquisition";

describe("Concept2 2000 m derivation", () => {
  it.each([
    ["trained male at 70 kg", 70, "MALE", "HIGHLY_TRAINED", 55],
    ["trained male at 80 kg", 80, "MALE", "HIGHLY_TRAINED", 55.625],
    ["trained female at 60 kg", 60, "FEMALE", "HIGHLY_TRAINED", 55.833_333],
    ["trained female at 65 kg", 65, "FEMALE", "HIGHLY_TRAINED", 56.153_846],
    ["untrained male", 90, "MALE", "NOT_HIGHLY_TRAINED", 43.888_889],
    ["untrained female", 60, "FEMALE", "NOT_HIGHLY_TRAINED", 54.75],
  ] as const)("uses the official coefficient branch for %s", (_label, weightKg, sex, level, expected) => {
    const result = calculateConcept2Result({
      age: 40,
      weightKg,
      sex,
      trainingLevel: level,
      totalSeconds: 450,
    });
    expect(result?.estimatedVo2MaxMlKgMin).toBeCloseTo(expected, 5);
  });

  it("changes the trained coefficient only above the documented weight thresholds", () => {
    const femaleAt = calculateConcept2Result({
      age: 40, weightKg: 61.36, sex: "FEMALE", trainingLevel: "HIGHLY_TRAINED", totalSeconds: 450,
    });
    const femaleAbove = calculateConcept2Result({
      age: 40, weightKg: 61.361, sex: "FEMALE", trainingLevel: "HIGHLY_TRAINED", totalSeconds: 450,
    });
    const maleAt = calculateConcept2Result({
      age: 40, weightKg: 75, sex: "MALE", trainingLevel: "HIGHLY_TRAINED", totalSeconds: 450,
    });
    const maleAbove = calculateConcept2Result({
      age: 40, weightKg: 75.001, sex: "MALE", trainingLevel: "HIGHLY_TRAINED", totalSeconds: 450,
    });
    expect(femaleAt?.estimatedVo2MaxMlKgMin).toBeCloseTo(54.595_828, 5);
    expect(femaleAbove?.estimatedVo2MaxMlKgMin).toBeCloseTo(59.484_037, 5);
    expect(maleAt?.estimatedVo2MaxMlKgMin).toBeCloseTo(51.333_333, 5);
    expect(maleAbove?.estimatedVo2MaxMlKgMin).toBeCloseTo(59.332_542, 5);
  });

  it("reproduces the official Concept2 estimate without accepting a browser-supplied result", () => {
    const result = calculateConcept2Result({
      age: 40,
      weightKg: 90,
      sex: "MALE",
      trainingLevel: "NOT_HIGHLY_TRAINED",
      totalSeconds: 450,
    });

    expect(result).not.toBeNull();
    expect(result?.paceSecondsPer500).toBe(112.5);
    expect(result?.averageWatts).toBeCloseTo(245.816, 3);
    expect(result?.estimatedVo2MaxMlKgMin).toBeCloseTo(43.889, 3);
    expect(result?.classification).toBe("GOOD");
    expect(result?.estimateOnly).toBe(true);
  });

  it("does not fabricate a positive VO2 result outside the formula range", () => {
    const result = calculateConcept2Result({
      age: 40,
      weightKg: 100,
      sex: "FEMALE",
      trainingLevel: "HIGHLY_TRAINED",
      totalSeconds: 1_200,
    });
    expect(result?.calculationStatus).toBe("OUTSIDE_FORMULA_RANGE");
    expect(result?.estimatedVo2MaxMlKgMin).toBeNull();
    expect(result?.classification).toBeNull();
  });

  it("keeps the estimate while marking age 70+ classification unavailable", () => {
    const result = calculateConcept2Result({
      age: 70,
      weightKg: 80,
      sex: "MALE",
      trainingLevel: "NOT_HIGHLY_TRAINED",
      totalSeconds: 420,
    });
    expect(result?.calculationStatus).toBe("CALCULATED");
    expect(result?.estimatedVo2MaxMlKgMin).toBeGreaterThan(0);
    expect(result?.classification).toBe("UNAVAILABLE_AGE_REFERENCE");
  });

  it("returns no derived cardio result when the test was not performed", () => {
    const responses = structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES);
    responses.cardio.status = "NOT_PERFORMED";
    responses.cardio.reason = "No rower";
    expect(deriveWeekZeroAcquisition(responses)).toEqual({ cardio: null });
  });

  it("returns null rather than inventing a result for incomplete performed input", () => {
    expect(
      calculateConcept2Result({
        age: 40,
        weightKg: 90,
        sex: "MALE",
        trainingLevel: null,
        totalSeconds: 450,
      }),
    ).toBeNull();
  });
});
