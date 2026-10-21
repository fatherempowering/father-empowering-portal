import { z } from "zod";

import { uuidSchema } from "@/lib/contracts/m1";

export const WEEK_ZERO_ACQUISITION_KIND = "WEEK_ZERO_ACQUISITION" as const;
export const WEEK_ZERO_ACQUISITION_SCHEMA_VERSION = 1 as const;
export const WEEK_ZERO_ACQUISITION_STATUSES = ["NOT_STARTED", "DRAFT", "SUBMITTED"] as const;
export const weekZeroAcquisitionStatusSchema = z.enum(WEEK_ZERO_ACQUISITION_STATUSES);

export const WEEK_ZERO_PHOTO_SLOTS = ["front", "side", "back"] as const;
export const photoSlotSchema = z.enum(WEEK_ZERO_PHOTO_SLOTS);
export type WeekZeroPhotoSlot = z.infer<typeof photoSlotSchema>;

export const WEEK_ZERO_MOVEMENT_KEYS = [
  "squat",
  "deadlift",
  "horizontalPress",
  "verticalPress",
  "cableRow",
  "pullUps",
  "lunge",
  "legPress",
] as const;
export const weekZeroMovementKeySchema = z.enum(WEEK_ZERO_MOVEMENT_KEYS);
export type WeekZeroMovementKey = z.infer<typeof weekZeroMovementKeySchema>;

export const WEEK_ZERO_MOVEMENT_VARIANTS = {
  squat: ["BARBELL_SQUAT", "DUMBBELL_SQUAT"],
  deadlift: ["BARBELL_DEADLIFT", "DUMBBELL_DEADLIFT"],
  horizontalPress: ["BENCH_PRESS", "DUMBBELL_PRESS"],
  verticalPress: ["BARBELL_OVERHEAD_PRESS", "DUMBBELL_SHOULDER_PRESS"],
  cableRow: ["CABLE_ROW"],
  pullUps: ["PULL_UPS"],
  lunge: ["BODYWEIGHT_LUNGE", "BARBELL_LUNGE", "DUMBBELL_LUNGE"],
  legPress: ["LEG_PRESS"],
} as const satisfies Record<WeekZeroMovementKey, readonly string[]>;

export const WEEK_ZERO_VARIANT_LOAD_MODES = {
  BARBELL_SQUAT: ["TOTAL"],
  DUMBBELL_SQUAT: ["PER_HAND"],
  BARBELL_DEADLIFT: ["TOTAL"],
  DUMBBELL_DEADLIFT: ["PER_HAND"],
  BENCH_PRESS: ["TOTAL"],
  DUMBBELL_PRESS: ["PER_HAND"],
  BARBELL_OVERHEAD_PRESS: ["TOTAL"],
  DUMBBELL_SHOULDER_PRESS: ["PER_HAND"],
  CABLE_ROW: ["TOTAL"],
  PULL_UPS: ["BODYWEIGHT", "ASSISTED", "ADDED"],
  BODYWEIGHT_LUNGE: ["BODYWEIGHT"],
  BARBELL_LUNGE: ["TOTAL"],
  DUMBBELL_LUNGE: ["PER_HAND"],
  LEG_PRESS: ["TOTAL"],
} as const;

export const WEEK_ZERO_LOAD_STATUSES = ["NOT_STARTED", "DONE", "NOT_PERFORMED"] as const;
export const weekZeroLoadStatusSchema = z.enum(WEEK_ZERO_LOAD_STATUSES);
export const WEEK_ZERO_LOAD_UNITS = ["LB", "KG"] as const;
export const weekZeroLoadUnitSchema = z.enum(WEEK_ZERO_LOAD_UNITS);
export const WEEK_ZERO_LOAD_MODES = [
  "TOTAL",
  "PER_HAND",
  "BODYWEIGHT",
  "ASSISTED",
  "ADDED",
] as const;
export const weekZeroLoadModeSchema = z.enum(WEEK_ZERO_LOAD_MODES);

export const WEEK_ZERO_MOBILITY_ANSWERS = [
  "NOT_ASSESSED",
  "NO",
  "YES",
  "NOT_PERFORMED",
] as const;
export const weekZeroMobilityAnswerSchema = z.enum(WEEK_ZERO_MOBILITY_ANSWERS);

export const WEEK_ZERO_CARDIO_STATUSES = ["NOT_STARTED", "DONE", "NOT_PERFORMED"] as const;
export const weekZeroCardioStatusSchema = z.enum(WEEK_ZERO_CARDIO_STATUSES);
export const WEEK_ZERO_CARDIO_SEXES = ["MALE", "FEMALE"] as const;
export const weekZeroCardioSexSchema = z.enum(WEEK_ZERO_CARDIO_SEXES);
export const WEEK_ZERO_TRAINING_LEVELS = [
  "HIGHLY_TRAINED",
  "NOT_HIGHLY_TRAINED",
] as const;
export const weekZeroTrainingLevelSchema = z.enum(WEEK_ZERO_TRAINING_LEVELS);

const optionalText = (maximumLength: number) => z.string().trim().max(maximumLength).nullable();
const optionalInches = z.number().finite().positive().max(200).nullable();
const precisePositiveNumber = (maximum: number, decimals: number) =>
  z
    .number()
    .finite()
    .positive()
    .max(maximum)
    .refine(
      (value) => Number(value.toFixed(decimals)) === value,
      `Value must have at most ${decimals} decimal places`,
    );

const baseLoadSchema = z
  .object({
    status: weekZeroLoadStatusSchema,
    variant: z.string().trim().min(1).max(80).nullable(),
    load: precisePositiveNumber(10_000, 3).nullable(),
    unit: weekZeroLoadUnitSchema.nullable(),
    mode: weekZeroLoadModeSchema.nullable(),
    reps: z.number().int().min(1).max(100).nullable(),
    rir: z.number().int().min(0).max(10).nullable(),
    reason: optionalText(500),
    note: optionalText(1_000),
  })
  .strict();

export type WeekZeroLoadEntry = z.infer<typeof baseLoadSchema>;

function validateLoadEntry(
  entry: WeekZeroLoadEntry,
  movement: WeekZeroMovementKey,
  context: z.RefinementCtx,
) {
  const addIssue = (path: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["loads", movement, path], message });

  if (entry.status === "NOT_STARTED") {
    if (
      entry.variant !== null ||
      entry.load !== null ||
      entry.unit !== null ||
      entry.mode !== null ||
      entry.reps !== null ||
      entry.rir !== null ||
      entry.reason !== null
    ) {
      addIssue("status", "A calibration not started cannot contain performance values.");
    }
    return;
  }

  if (entry.status === "NOT_PERFORMED") {
    if (
      entry.variant !== null ||
      entry.load !== null ||
      entry.unit !== null ||
      entry.mode !== null ||
      entry.reps !== null ||
      entry.rir !== null
    ) {
      addIssue("status", "A calibration not performed cannot contain performance values.");
    }
    return;
  }

  if (entry.variant && !WEEK_ZERO_MOVEMENT_VARIANTS[movement].includes(entry.variant as never)) {
    addIssue("variant", "Select an allowed movement variant.");
  }
  if (entry.reason !== null) addIssue("reason", "A performed calibration cannot have a skip reason.");
  if (
    entry.variant &&
    entry.mode &&
    !(WEEK_ZERO_VARIANT_LOAD_MODES[entry.variant as keyof typeof WEEK_ZERO_VARIANT_LOAD_MODES] as
      | readonly string[]
      | undefined)?.includes(entry.mode)
  ) {
    addIssue("mode", "The load mode does not match the selected movement variant.");
  }

  if (entry.mode === "BODYWEIGHT") {
    if (entry.load !== null || entry.unit !== null) {
      addIssue("load", "Bodyweight calibrations do not accept a separate load.");
    }
  }
}

const cardioSchema = z
  .object({
    status: weekZeroCardioStatusSchema,
    reason: optionalText(500),
    age: z.number().int().min(16).max(100).nullable(),
    weightKg: precisePositiveNumber(317.52, 3).min(31.75).nullable(),
    sex: weekZeroCardioSexSchema.nullable(),
    trainingLevel: weekZeroTrainingLevelSchema.nullable(),
    totalSeconds: precisePositiveNumber(1_200, 1).min(240).nullable(),
    notes: optionalText(1_000),
  })
  .strict()
  .superRefine((cardio, context) => {
    const addIssue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (cardio.status === "NOT_STARTED") {
      if (
        cardio.reason !== null ||
        cardio.age !== null ||
        cardio.weightKg !== null ||
        cardio.sex !== null ||
        cardio.trainingLevel !== null ||
        cardio.totalSeconds !== null
      ) {
        addIssue("status", "A cardio test not started cannot contain result values.");
      }
      return;
    }

    if (cardio.status === "NOT_PERFORMED") {
      if (
        cardio.age !== null ||
        cardio.weightKg !== null ||
        cardio.sex !== null ||
        cardio.trainingLevel !== null ||
        cardio.totalSeconds !== null
      ) {
        addIssue("status", "A cardio test not performed cannot contain result values.");
      }
      return;
    }

    if (cardio.reason !== null) addIssue("reason", "A performed cardio test cannot have a skip reason.");
  });

export const weekZeroAcquisitionResponsesSchema = z
  .object({
    instructionsAccepted: z.boolean(),
    photos: z
      .object({
        front: uuidSchema.nullable(),
        side: uuidSchema.nullable(),
        back: uuidSchema.nullable(),
        notes: optionalText(1_000),
      })
      .strict(),
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
    loads: z
      .object({
        squat: baseLoadSchema,
        deadlift: baseLoadSchema,
        horizontalPress: baseLoadSchema,
        verticalPress: baseLoadSchema,
        cableRow: baseLoadSchema,
        pullUps: baseLoadSchema,
        lunge: baseLoadSchema,
        legPress: baseLoadSchema,
      })
      .strict(),
    cardio: cardioSchema,
    mobility: z
      .object({
        painSquat: weekZeroMobilityAnswerSchema,
        painHinge: weekZeroMobilityAnswerSchema,
        painPush: weekZeroMobilityAnswerSchema,
        painPull: weekZeroMobilityAnswerSchema,
        painCardio: weekZeroMobilityAnswerSchema,
        limitedMovement: optionalText(1_000),
        comfortableMovement: optionalText(1_000),
        tightArea: optionalText(1_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((responses, context) => {
    for (const movement of WEEK_ZERO_MOVEMENT_KEYS) {
      validateLoadEntry(responses.loads[movement], movement, context);
    }
  });
export type WeekZeroAcquisitionResponses = z.infer<typeof weekZeroAcquisitionResponsesSchema>;

const EMPTY_LOAD: WeekZeroLoadEntry = {
  status: "NOT_STARTED",
  variant: null,
  load: null,
  unit: null,
  mode: null,
  reps: null,
  rir: null,
  reason: null,
  note: null,
};

export const EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES: WeekZeroAcquisitionResponses = {
  instructionsAccepted: false,
  photos: { front: null, side: null, back: null, notes: null },
  measurements: {
    bodyWeightLb: null,
    waistIn: null,
    chestIn: null,
    hipsIn: null,
    rightArmIn: null,
    rightThighIn: null,
    other: null,
  },
  loads: Object.fromEntries(
    WEEK_ZERO_MOVEMENT_KEYS.map((movement) => [movement, { ...EMPTY_LOAD }]),
  ) as WeekZeroAcquisitionResponses["loads"],
  cardio: {
    status: "NOT_STARTED",
    reason: null,
    age: null,
    weightKg: null,
    sex: null,
    trainingLevel: null,
    totalSeconds: null,
    notes: null,
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
};

export const completeWeekZeroAcquisitionResponsesSchema =
  weekZeroAcquisitionResponsesSchema.superRefine((responses, context) => {
    if (!responses.instructionsAccepted) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructionsAccepted"],
        message: "Safety instructions must be accepted before submission.",
      });
    }
    for (const slot of WEEK_ZERO_PHOTO_SLOTS) {
      if (responses.photos[slot] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["photos", slot],
          message: "All three progress photos are required before submission.",
        });
      }
    }
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
    for (const movement of WEEK_ZERO_MOVEMENT_KEYS) {
      const calibration = responses.loads[movement];
      if (calibration.status === "NOT_STARTED") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loads", movement, "status"],
          message: "Every calibration must be performed or explicitly marked not performed.",
        });
      } else if (calibration.status === "NOT_PERFORMED") {
        if (!calibration.reason?.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loads", movement, "reason"],
            message: "A reason is required when not performed.",
          });
        }
      } else {
        if (!calibration.variant) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loads", movement, "variant"],
            message: "Select the movement variant used.",
          });
        }
        if (!calibration.mode) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loads", movement, "mode"],
            message: "A load mode is required when performed.",
          });
        }
        if (calibration.reps === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loads", movement, "reps"],
            message: "Repetitions are required when performed.",
          });
        }
        if (calibration.mode !== null && calibration.mode !== "BODYWEIGHT") {
          if (calibration.load === null || calibration.unit === null) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["loads", movement, "load"],
              message: "Load and unit are required for this load mode.",
            });
          }
        }
      }
    }
    const cardio = responses.cardio;
    if (cardio.status === "NOT_STARTED") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cardio", "status"],
        message: "Cardio must be performed or explicitly marked not performed.",
      });
    } else if (cardio.status === "NOT_PERFORMED") {
      if (!cardio.reason?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cardio", "reason"],
          message: "A reason is required when cardio is not performed.",
        });
      }
    } else {
      for (const [field, value] of [
        ["age", cardio.age],
        ["weightKg", cardio.weightKg],
        ["sex", cardio.sex],
        ["trainingLevel", cardio.trainingLevel],
        ["totalSeconds", cardio.totalSeconds],
      ] as const) {
        if (value === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["cardio", field],
            message: "This Concept2 result field is required when performed.",
          });
        }
      }
    }
    const mobilityFields = [
      "painSquat",
      "painHinge",
      "painPush",
      "painPull",
      "painCardio",
    ] as const;
    for (const field of mobilityFields) {
      if (responses.mobility[field] === "NOT_ASSESSED") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mobility", field],
          message: "Every mobility item must be answered or explicitly marked not performed.",
        });
      }
    }
    for (const field of ["limitedMovement", "comfortableMovement", "tightArea"] as const) {
      if (!responses.mobility[field]?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mobility", field],
          message: "A mobility answer is required; use N.A. when appropriate.",
        });
      }
    }
  });

export const saveWeekZeroAcquisitionRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
    responses: weekZeroAcquisitionResponsesSchema,
  })
  .strict();
export type SaveWeekZeroAcquisitionRequest = z.infer<
  typeof saveWeekZeroAcquisitionRequestSchema
>;

export const submitWeekZeroAcquisitionRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
  })
  .strict();
export type SubmitWeekZeroAcquisitionRequest = z.infer<
  typeof submitWeekZeroAcquisitionRequestSchema
>;

export const weekZeroPhotoMutationSchema = z
  .object({
    slot: photoSlotSchema,
    assetId: uuidSchema,
    expectedVersion: z.number().int().nonnegative(),
    clientMutationId: uuidSchema,
  })
  .strict();
export type WeekZeroPhotoMutation = z.infer<typeof weekZeroPhotoMutationSchema>;

export const concept2DerivedResultSchema = z
  .object({
    machine: z.literal("CONCEPT2_ROWER"),
    distanceMeters: z.literal(2_000),
    paceSecondsPer500: z.number().finite().positive(),
    averageWatts: z.number().finite().positive(),
    estimatedVo2MaxMlKgMin: z.number().finite().positive().nullable(),
    calculationStatus: z.enum(["CALCULATED", "OUTSIDE_FORMULA_RANGE"]),
    classification: z
      .enum([
        "POOR",
        "FAIR",
        "AVERAGE",
        "GOOD",
        "EXCELLENT",
        "OUTSIDE_REFERENCE",
        "UNAVAILABLE_AGE_REFERENCE",
      ])
      .nullable(),
    estimateOnly: z.literal(true),
    formulaSource: z.literal("https://www.concept2.com/training/vo2max-calculator"),
  })
  .strict();
export type Concept2DerivedResult = z.infer<typeof concept2DerivedResultSchema>;

export const weekZeroAcquisitionDerivedSchema = z
  .object({ cardio: concept2DerivedResultSchema.nullable() })
  .strict();
export type WeekZeroAcquisitionDerived = z.infer<typeof weekZeroAcquisitionDerivedSchema>;

const snapshotFields = {
  kind: z.literal(WEEK_ZERO_ACQUISITION_KIND),
  schemaVersion: z.literal(WEEK_ZERO_ACQUISITION_SCHEMA_VERSION),
  version: z.number().int().nonnegative(),
  responses: weekZeroAcquisitionResponsesSchema,
  derived: weekZeroAcquisitionDerivedSchema,
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  submittedAt: z.string().datetime({ offset: true }).nullable(),
};

export const weekZeroAcquisitionSnapshotSchema = z
  .object({
    ...snapshotFields,
    status: weekZeroAcquisitionStatusSchema,
  })
  .strict();
export type WeekZeroAcquisitionSnapshot = z.infer<typeof weekZeroAcquisitionSnapshotSchema>;

export const coachWeekZeroAcquisitionSchema = z
  .object({
    ...snapshotFields,
    status: z.enum(["NOT_SUBMITTED", "SUBMITTED"]),
    responses: weekZeroAcquisitionResponsesSchema.nullable(),
    derived: weekZeroAcquisitionDerivedSchema.nullable(),
  })
  .strict();
export type CoachWeekZeroAcquisition = z.infer<typeof coachWeekZeroAcquisitionSchema>;

export const weekZeroPhotoUploadResponseSchema = z
  .object({ data: z.object({ acquisition: weekZeroAcquisitionSnapshotSchema }).strict() })
  .strict();

export function isWeekZeroAcquisitionComplete(responses: WeekZeroAcquisitionResponses): boolean {
  return completeWeekZeroAcquisitionResponsesSchema.safeParse(responses).success;
}
