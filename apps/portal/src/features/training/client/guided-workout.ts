import type { DraftBlock, DraftExercise, DraftSession } from "@/lib/contracts/training-drafts";
import type { WorkoutSetResult } from "@/lib/contracts/training-results";

export type GuidedMember = { exercise: DraftExercise; setNumber: number; extra: boolean };
export type GuidedStep = { key: string; round: number; extra: boolean; members: GuidedMember[]; restSeconds: number };
export type GuidedUnit = { key: string; block: DraftBlock; exercises: DraftExercise[]; grouped: boolean; steps: GuidedStep[] };
type SetIdentity = Pick<WorkoutSetResult, "exerciseId" | "setNumber">;
type SetState = SetIdentity & Pick<WorkoutSetResult, "status">;

export function guidedSetKey(set: SetIdentity) {
  return `${set.exerciseId.toLowerCase()}:${set.setNumber}`;
}

/** Derive order from the frozen prescription, not names or an independent local diary. */
export function buildGuidedUnits(session: DraftSession, sets: SetIdentity[]): GuidedUnit[] {
  return session.blocks.flatMap((block) => {
    const groups = block.mode === "standard" ? block.exercises.map((exercise) => [exercise]) : [block.exercises];
    return groups.filter((exercises) => exercises.length).map((exercises) => {
      const grouped = block.mode !== "standard";
      const key = grouped ? block.id : exercises[0].id;
      const rounds = Math.max(...exercises.map((exercise) => exercise.prescription.sets));
      const steps: GuidedStep[] = Array.from({ length: rounds }, (_, index) => {
        const members = exercises.filter((exercise) => exercise.prescription.sets > index)
          .map((exercise) => ({ exercise, setNumber: index + 1, extra: false }));
        return {
          key: `${key}:prescribed:${index + 1}`, round: index + 1, extra: false, members,
          // Zero rest is intentional. Never substitute another movement's rest.
          restSeconds: grouped ? block.restSeconds
            : members[0].exercise.prescription.prescribedSets?.[index]?.restSeconds ?? members[0].exercise.prescription.restSeconds,
        };
      });
      // Unequal extras are individual additions, never invented partner sets.
      for (const exercise of exercises) {
        const extras = sets.filter((set) => set.exerciseId.toLowerCase() === exercise.id.toLowerCase()
          && set.setNumber > exercise.prescription.sets).sort((a, b) => a.setNumber - b.setNumber);
        for (const extra of extras) steps.push({
          key: `${key}:extra:${exercise.id}:${extra.setNumber}`, round: extra.setNumber, extra: true,
          members: [{ exercise, setNumber: extra.setNumber, extra: true }],
          restSeconds: grouped ? block.restSeconds : exercise.prescription.restSeconds,
        });
      }
      return { key, block, exercises, grouped, steps };
    });
  });
}

export function isGuidedStepSaved(step: GuidedStep, saved: SetState[]) {
  const statuses = new Map(saved.map((set) => [guidedSetKey(set), set.status]));
  return step.members.every(({ exercise, setNumber }) => {
    const status = statuses.get(guidedSetKey({ exerciseId: exercise.id, setNumber }));
    return status === "DONE" || status === "SKIPPED";
  });
}

export function firstPendingGuidedStep(units: GuidedUnit[], saved: SetState[]) {
  for (const unit of units) {
    const step = unit.steps.find((candidate) => !isGuidedStepSaved(candidate, saved));
    if (step) return { unit, step };
  }
  return null;
}

export function guidedProgress(units: GuidedUnit[], saved: SetState[]) {
  const statuses = new Map(saved.map((set) => [guidedSetKey(set), set.status]));
  const members = units.flatMap((unit) => unit.steps.flatMap((step) => step.members));
  let done = 0;
  let skipped = 0;
  for (const member of members) {
    const status = statuses.get(guidedSetKey({ exerciseId: member.exercise.id, setNumber: member.setNumber }));
    if (status === "DONE") done += 1;
    if (status === "SKIPPED") skipped += 1;
  }
  return { total: members.length, done, skipped, resolved: done + skipped,
    percent: members.length ? Math.round((done + skipped) / members.length * 100) : 0 };
}

/** A deadline survives background-tab throttling without claiming durable timer state. */
export function restSecondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Presentation only: the original prescribed duration remains the denominator. */
export function restRingPercent(deadline: number, now: number, totalSeconds: number) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now) || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, ((deadline - now) / (totalSeconds * 1000)) * 100));
}
