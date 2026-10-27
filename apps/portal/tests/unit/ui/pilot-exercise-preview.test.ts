import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PilotExercisePreview } from "@/features/training/shared/pilot-exercise-preview";
import { pilotExerciseSchema, type PilotExercise } from "@/lib/contracts/exercise-pilot";

Object.assign(globalThis, { React });

function fixture(): PilotExercise {
  return pilotExerciseSchema.parse({
    id: "DB_034", sourceVersion: "1.1.0", previousVersion: "1.0.0",
    name: { fr: "Curl alterné", en: "Alternating curl" },
    equipment: { id: "dumbbell", labels: { fr: "Haltères", en: "Dumbbells" } },
    muscles: { primary: [], secondary: [], stabilizers: [] },
    instructions: {
      fr: { setup: "Installation française complète.", execution: "Exécution française complète.", finish: "Fin française complète." },
      en: { setup: "Complete English setup.", execution: "Complete English execution.", finish: "Complete English finish." },
    },
    performance: {
      measure: "repetitions",
      counting: { fr: "Note les répétitions de chaque bras, sans additionner les côtés.", en: "Record repetitions for each arm without adding the sides together." },
      load: { fr: "Charge d’un seul haltère, pas la somme des deux.", en: "Load of one dumbbell, not the sum of both." },
      countingDecision: "MAX_PER_ARM_2026_10_23",
      notes: { fr: "Autres conventions à vérifier avant prescription.", en: "Review the other conventions before prescribing." },
    },
    machines: [], status: "DRAFT", instructionReview: "PENDING", canPrescribe: false, media: null,
  });
}

function render(exercise: PilotExercise, language: "fr" | "en" = "fr") {
  return renderToStaticMarkup(React.createElement(PilotExercisePreview, { exercise, language }));
}

describe("Coach-only pilot reading preview", () => {
  it.each(["fr", "en"] as const)("renders all three untruncated instructions in %s only", (language) => {
    const exercise = fixture();
    const other = language === "fr" ? "en" : "fr";
    exercise.instructions[language].execution = "x".repeat(1_900);
    const html = render(exercise, language);
    expect(html).toContain(`lang="${language}"`);
    expect(html).toContain(exercise.name[language]);
    expect(html).not.toContain(exercise.name[other]);
    for (const step of ["setup", "execution", "finish"] as const) {
      expect(html).toContain(exercise.instructions[language][step]);
      expect(html).not.toContain(exercise.instructions[other][step]);
    }
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html.indexOf(exercise.instructions[language].setup)).toBeLessThan(html.indexOf(exercise.instructions[language].execution));
    expect(html.indexOf(exercise.instructions[language].execution)).toBeLessThan(html.indexOf(exercise.instructions[language].finish));
  });

  it.each(["fr", "en"] as const)("makes per-arm counting explicit without approving instructions or load in %s", (language) => {
    const exercise = fixture();
    const html = render(exercise, language);
    expect(html).toContain(language === "fr" ? "Aperçu de lecture — non publié" : "Reading preview — unpublished");
    expect(html).toContain(language === "fr" ? "Consignes en attente de validation" : "Instructions pending review");
    expect(html).toContain(language === "fr" ? "Comptage retenu : répétitions par bras" : "Selected count: repetitions per arm");
    expect(html).toContain(language === "fr" ? "Charge — convention proposée" : "Load — proposed convention");
    for (const field of ["counting", "load", "notes"] as const) expect(html).toContain(exercise.performance[field][language]);
    expect(exercise.instructionReview).toBe("PENDING");
    expect(exercise.canPrescribe).toBe(false);
  });

  it("keeps unaccepted counting a proposal", () => {
    const exercise = fixture();
    exercise.performance.countingDecision = "PROPOSED";
    for (const language of ["fr", "en"] as const) {
      const html = render(exercise, language);
      expect(html).toContain(language === "fr" ? "Convention de comptage proposée" : "Proposed counting convention");
      expect(html).not.toContain(language === "fr" ? "Comptage retenu" : "Selected count");
    }
  });

  it("does not invent media, interactive controls, measured results or conversions", () => {
    const exercise = fixture();
    const before = structuredClone(exercise);
    const html = render(exercise);
    expect(html).not.toMatch(/<(img|video|iframe|input|button|form|select|textarea|a|progress|meter)\b/);
    expect(html).not.toMatch(/\b(?:kg|lb|kcal|VO2)\b/);
    expect(exercise).toEqual(before);
  });

  it("renders supplied instruction content as escaped text, not executable markup", () => {
    const exercise = fixture();
    exercise.instructions.fr.setup = '<script>alert("unsafe")</script>';
    const html = render(exercise);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
