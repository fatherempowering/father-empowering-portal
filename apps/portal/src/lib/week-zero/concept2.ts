import type {
  Concept2DerivedResult,
  WeekZeroAcquisitionResponses,
} from "@/lib/contracts/week-zero-acquisition";

type CompletedConcept2Input = Pick<
  WeekZeroAcquisitionResponses["cardio"],
  "age" | "weightKg" | "sex" | "trainingLevel" | "totalSeconds"
>;

const MALE_THRESHOLDS = [
  [25, 34, 44, 53],
  [23, 31, 42, 50],
  [20, 27, 39, 45],
  [18, 25, 38, 43],
  [16, 23, 36, 41],
] as const;

const FEMALE_THRESHOLDS = [
  [24, 31, 39, 50],
  [20, 28, 37, 45],
  [17, 25, 35, 42],
  [15, 22, 34, 40],
  [13, 21, 33, 37],
] as const;

function classifyVo2(
  vo2: number,
  age: number,
  sex: "MALE" | "FEMALE",
): Concept2DerivedResult["classification"] {
  if (vo2 < 10) return "OUTSIDE_REFERENCE";
  if (age >= 70) return "UNAVAILABLE_AGE_REFERENCE";

  const band = age <= 29 ? 0 : age <= 39 ? 1 : age <= 49 ? 2 : age <= 59 ? 3 : 4;
  const [poor, fair, average, good] =
    (sex === "FEMALE" ? FEMALE_THRESHOLDS : MALE_THRESHOLDS)[band];

  if (vo2 < poor) return "POOR";
  if (vo2 < fair) return "FAIR";
  if (vo2 < average) return "AVERAGE";
  if (vo2 < good) return "GOOD";
  return "EXCELLENT";
}

/**
 * Implements the Concept2 2000 m estimates used by the Legacy portal.
 * The value is an estimate, not a clinical measurement. Inputs are validated
 * by the shared contract before this function is called.
 */
export function calculateConcept2Result(
  input: CompletedConcept2Input,
): Concept2DerivedResult | null {
  if (
    input.age === null ||
    input.weightKg === null ||
    input.sex === null ||
    input.trainingLevel === null ||
    input.totalSeconds === null
  ) {
    return null;
  }

  const paceSecondsPer500 = input.totalSeconds / 4;
  const averageWatts = 2.8 / Math.pow(paceSecondsPer500 / 500, 3);
  const totalMinutes = input.totalSeconds / 60;

  let oxygenLitresPerMinute: number;
  if (input.trainingLevel === "HIGHLY_TRAINED") {
    if (input.sex === "FEMALE") {
      oxygenLitresPerMinute = (input.weightKg <= 61.36 ? 14.6 : 14.9) - 1.5 * totalMinutes;
    } else {
      oxygenLitresPerMinute = (input.weightKg <= 75 ? 15.1 : 15.7) - 1.5 * totalMinutes;
    }
  } else {
    oxygenLitresPerMinute =
      input.sex === "FEMALE" ? 10.26 - 0.93 * totalMinutes : 10.7 - 0.9 * totalMinutes;
  }

  const rawVo2 = (oxygenLitresPerMinute * 1_000) / input.weightKg;
  const hasUsableEstimate = Number.isFinite(rawVo2) && rawVo2 > 0;

  return {
    machine: "CONCEPT2_ROWER",
    distanceMeters: 2_000,
    paceSecondsPer500,
    averageWatts,
    estimatedVo2MaxMlKgMin: hasUsableEstimate ? rawVo2 : null,
    calculationStatus: hasUsableEstimate ? "CALCULATED" : "OUTSIDE_FORMULA_RANGE",
    classification: hasUsableEstimate ? classifyVo2(rawVo2, input.age, input.sex) : null,
    estimateOnly: true,
    formulaSource: "https://www.concept2.com/training/vo2max-calculator",
  };
}

export function deriveWeekZeroAcquisition(
  responses: WeekZeroAcquisitionResponses,
): { cardio: Concept2DerivedResult | null } {
  return {
    cardio:
      responses.cardio.status === "DONE" ? calculateConcept2Result(responses.cardio) : null,
  };
}
