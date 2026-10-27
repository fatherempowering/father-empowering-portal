import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublishedExerciseGuidance } from "@/features/training/shared/published-exercise-guidance";
import { pilotResultExercise } from "../training/pilot-result-fixture";

Object.assign(globalThis, { React });

describe("published pilot instructions", () => {
  it.each([true, false])("renders the frozen full instructions in the selected language (French=%s)", french => {
    const exercise = pilotResultExercise();
    const language = french ? "fr" : "en";
    const other = french ? "en" : "fr";
    exercise.pilot!.instructions[language].execution = "x".repeat(1_900);
    const before = structuredClone(exercise);
    const html = renderToStaticMarkup(React.createElement(PublishedExerciseGuidance, { exercise, french }));
    for (const step of ["setup", "execution", "finish"] as const) {
      expect(html).toContain(exercise.pilot!.instructions[language][step]);
      expect(html).not.toContain(exercise.pilot!.instructions[other][step]);
    }
    expect(html).toContain(exercise.pilot!.performance.counting[language]);
    expect(html).toContain(exercise.pilot!.performance.notes[language]);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toMatch(/<(img|video|iframe|input|form)\b/);
    expect(exercise).toEqual(before);
  });

  it("does not add pilot notices or instructions to old published exercises", () => {
    const exercise = pilotResultExercise();
    delete exercise.pilot;
    expect(renderToStaticMarkup(React.createElement(PublishedExerciseGuidance, { exercise, french: true }))).toBe("");
  });

  it("escapes instruction markup and does not promote a draft into an approved instruction", () => {
    const exercise = pilotResultExercise();
    exercise.pilot!.instructions.fr.setup = '<script>secret()</script>';
    const html = renderToStaticMarkup(React.createElement(PublishedExerciseGuidance, { exercise, french: true, coach: true }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("test staging");
    expect(html).toContain("client test");
  });
});
