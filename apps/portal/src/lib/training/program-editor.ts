import type { ExerciseSnapshot } from "@/lib/contracts/training";
import type { DraftBlock, DraftExercise, DraftSession, ProgramEditor } from "@/lib/contracts/training-drafts";

const text = (fr = "", en = "") => ({ fr, en });
export function newProgram(): ProgramEditor {
  return { schemaVersion: 1, phaseId: crypto.randomUUID(), title: text("Nouveau programme"), weeks: [{ number: 1, objective: text(), sessions: [] }] };
}
export function newSession(): DraftSession {
  return { id: crypto.randomUUID(), title: text("Nouvelle séance"), type: "training", required: true,
    schedule: { mode: "flexible", day: null }, warmup: text(), blocks: [] };
}
export function newBlock(): DraftBlock {
  return { id: crypto.randomUUID(), label: text(), mode: "standard", restSeconds: 90, exercises: [] };
}
export function addLibraryExercise(exercise: ExerciseSnapshot): DraftExercise {
  return { id: crypto.randomUUID(), libraryExerciseId: exercise.id, name: exercise.name, cue: structuredClone(exercise.cue), media: null,
    prescription: { sets: 3, reps: "8-10", targetRir: 2, restSeconds: 90, tempo: "", loadTarget: "", unit: exercise.defaultUnit } };
}
export function duplicateWeek(program: ProgramEditor, index: number): ProgramEditor {
  if (program.weeks.length >= 52 || !program.weeks[index]) return program;
  const result = structuredClone(program);
  // The same session/exercise IDs across weeks represent the same movements.
  // Deep cloning prevents later week edits from changing the source week.
  result.weeks.splice(index + 1, 0, structuredClone(program.weeks[index]));
  result.weeks.forEach((week, i) => { week.number = i + 1; });
  return result;
}
export function weekHasContent(week: ProgramEditor["weeks"][number]): boolean {
  return Boolean(week.sessions.length || week.objective.fr.trim() || week.objective.en.trim());
}

/** Week numbers are destinations, not insertion positions. Unselected weeks stay put. */
export function planWeekCopy(program: ProgramEditor, sourceIndex: number, destinations: number[]) {
  if (!Number.isInteger(sourceIndex) || !program.weeks[sourceIndex] ||
    destinations.some((number) => !Number.isInteger(number) || number < 1 || number > 52 || number === sourceIndex + 1)) {
    throw new RangeError("INVALID_WEEK_SELECTION");
  }
  const targets = [...new Set(destinations)].sort((a, b) => a - b);
  const lastWeek = Math.max(program.weeks.length, ...targets);
  const added = Array.from({ length: lastWeek - program.weeks.length }, (_, i) => program.weeks.length + i + 1);
  return {
    targets,
    replacements: targets.filter((number) => program.weeks[number - 1] && weekHasContent(program.weeks[number - 1])),
    added,
    empty: added.filter((number) => !targets.includes(number)),
  };
}

export function copyWeekToWeeks(program: ProgramEditor, sourceIndex: number, destinations: number[], allowReplacement = false): ProgramEditor {
  const plan = planWeekCopy(program, sourceIndex, destinations);
  if (!plan.targets.length) throw new RangeError("INVALID_WEEK_SELECTION");
  if (plan.replacements.length && !allowReplacement) throw new Error("WEEK_REPLACEMENT_REQUIRES_CONFIRMATION");
  const result = structuredClone(program);
  for (const number of plan.added) result.weeks.push({ number, objective: text(), sessions: [] });
  for (const number of plan.targets) {
    // Preserve movement identities across weeks, as with single-week duplication,
    // while independently cloning every nested prescription and instruction.
    result.weeks[number - 1] = { ...structuredClone(program.weeks[sourceIndex]), number };
  }
  // Match the existing draft contract before replacing any editor state.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 512_000) throw new Error("PROGRAM_TOO_LARGE");
  return result;
}
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = [...items]; const target = index + direction;
  if (target < 0 || target >= items.length || !items[index]) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function draftWarnings(program: ProgramEditor): string[] {
  const warnings: string[] = [];
  for (const week of program.weeks) {
    const prefix = `Semaine ${week.number}`;
    if (!week.sessions.length) warnings.push(`${prefix} : aucune séance ajoutée.`);
    for (const [i, session] of week.sessions.entries()) {
      const label = `${prefix}, séance ${i + 1}`;
      if (!session.title.fr && !session.title.en) warnings.push(`${label} : ajoute un titre.`);
      if (session.type === "training" && !session.blocks.length) warnings.push(`${label} : aucun bloc ajouté.`);
      for (const [b, block] of session.blocks.entries()) {
        if (!block.exercises.length) warnings.push(`${label}, bloc ${b + 1} : aucun exercice.`);
        if ((block.mode === "superset" && block.exercises.length !== 2) || (block.mode === "finisher" && block.exercises.length < 2)) warnings.push(`${label}, bloc ${b + 1} : groupe incomplet.`);
        if (block.mode !== "standard" && block.exercises.some((e) => e.prescription.sets !== block.exercises[0]?.prescription.sets)) warnings.push(`${label}, bloc ${b + 1} : harmonise le nombre de séries par tour.`);
      }
    }
  }
  return warnings;
}
export function compactUniformSets(program: ProgramEditor): ProgramEditor {
  const copy = structuredClone(program);
  for (const week of copy.weeks) for (const session of week.sessions) for (const block of session.blocks) for (const exercise of block.exercises) {
    const sets = exercise.prescription.prescribedSets;
    if (sets?.length === exercise.prescription.sets && sets.length && sets.every((set) => JSON.stringify(set) === JSON.stringify(sets[0]))) {
      exercise.prescription = { ...sets[0], sets: sets.length };
    }
  }
  return copy;
}
