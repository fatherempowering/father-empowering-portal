import { describe, expect, it } from "vitest";
import { draftExerciseSchema } from "@/lib/contracts/training-drafts";
import { pilotAllowedUnits } from "@/lib/contracts/training-pilot";
import { workoutSetResultSchema } from "@/lib/contracts/training-results";
import { programIssues } from "@/lib/training/program-issues";
import { newBlock, newProgram, newSession } from "@/lib/training/program-editor";
import { pilotResultExercise, pilotResultSet } from "./pilot-result-fixture";
function program() {
  const document = newProgram(); const session = newSession(); const block = newBlock();
  block.exercises = [pilotResultExercise()]; session.blocks = [block]; document.weeks[0].sessions = [session];
  return document;
}
describe("Builder actionable issues", () => {
  it("points to the exact numeric field without modifying input", () => {
    const document = program(); document.weeks[0].sessions[0].blocks[0].exercises[0].prescription.sets = Number.NaN;
    const issue = programIssues(document, "save")[0];
    expect(issue.path).toEqual(["weeks", 0, "sessions", 0, "blocks", 0, "exercises", 0, "prescription", "sets"]);
    expect(issue.message).toContain("Semaine 1 · séance 1 · bloc 1 · Curl alterné"); expect(issue.message).toContain("1 à 20");
    expect(Number.isNaN(document.weeks[0].sessions[0].blocks[0].exercises[0].prescription.sets)).toBe(true);
  });
  it("allows incomplete drafts but gives navigable publication requirements", () => {
    const document = newProgram(); expect(programIssues(document, "save")).toEqual([]);
    expect(programIssues(document, "publish")[0].path).toEqual(["weeks", 0, "sessions"]);
    document.weeks[0].sessions = [newSession()]; document.weeks[0].sessions[0].title = { fr: "", en: "" };
    expect(programIssues(document, "publish").map(x => x.path.at(-1))).toEqual(["fr", "blocks"]);
  });
  it("targets missing per-set configuration and clears issues after correction", () => {
    const document = program(); const exercise = pilotResultExercise("BA_027");
    document.weeks[0].sessions[0].blocks[0].exercises = [exercise];
    const { sets: _sets, ...base } = exercise.prescription; void _sets;
    exercise.prescription.prescribedSets = [{ ...base }, { ...base, reps: "10", loadTarget: "" }];
    const issues = programIssues(document, "publish");
    expect(issues).toHaveLength(1); expect(issues[0].path.slice(-3)).toEqual(["prescribedSets", 1, "loadTarget"]);
    exercise.prescription.prescribedSets[1].loadTarget = "Bande rouge"; expect(programIssues(document, "publish")).toEqual([]);
  });
  it("deduplicates structural checks and requires matching grouped rounds", () => {
    const document = program(); const block = document.weeks[0].sessions[0].blocks[0];
    block.mode = "superset"; expect(programIssues(document, "publish")[0].message).toContain("exactement deux");
    const second = pilotResultExercise(); second.id = crypto.randomUUID(); second.prescription.sets = 3; block.exercises.push(second);
    expect(programIssues(document, "publish")[0].path.at(-1)).toBe("sets");
    second.prescription.sets = 2; expect(programIssues(document, "publish")).toEqual([]);
  });
});
describe("Explicit mass units", () => {
  it("allows lb/kg only for mass pilots and preserves the source snapshot", () => {
    const exercise = pilotResultExercise(); const source = structuredClone(exercise.pilot);
    exercise.prescription.unit = "kg";
    expect(draftExerciseSchema.parse(exercise).prescription.unit).toBe("kg"); expect(exercise.pilot).toEqual(source);
    expect(pilotAllowedUnits(exercise.pilot!)).toEqual(["lb", "kg"]);
  });
  it.each(["BA_027", "DB_045", "BW_049"])("rejects kg for non-mass %s", (source) => {
    const exercise = pilotResultExercise(source); exercise.prescription.unit = "kg";
    expect(draftExerciseSchema.safeParse(exercise).success).toBe(false);
  });
  it("requires kg repetitions and preserves the entered measured mass", () => {
    const set = { ...pilotResultSet(), unit: "kg", load: 25 };
    expect(workoutSetResultSchema.parse(set).load).toBe(25);
    expect(workoutSetResultSchema.safeParse({ ...set, reps: null }).success).toBe(false);
    expect(workoutSetResultSchema.safeParse({ ...set, load: null }).success).toBe(false);
    expect(workoutSetResultSchema.parse(pilotResultSet()).unit).toBe("lb");
  });
});
