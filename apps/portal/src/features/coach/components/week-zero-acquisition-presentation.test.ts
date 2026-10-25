import { describe, expect, it } from "vitest";
import { EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES, WEEK_ZERO_MOVEMENT_KEYS, type CoachWeekZeroAcquisition } from "@/lib/contracts/week-zero-acquisition";
import { deriveWeekZeroAcquisition } from "@/lib/week-zero/concept2";
import { acquisitionSections, calibrationItems, formatSeconds } from "./week-zero-acquisition-presentation";

const submitted = (): CoachWeekZeroAcquisition => ({
  kind: "WEEK_ZERO_ACQUISITION", schemaVersion: 1, version: 2, status: "SUBMITTED",
  responses: structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES), derived: { cardio: null },
  updatedAt: "2026-10-20T12:00:00Z", submittedAt: "2026-10-20T12:00:00Z",
});

describe("Coach Week Zero presentation", () => {
  it("does not present a draft or absent response as submitted results", () => {
    expect(acquisitionSections({ ...submitted(), status: "NOT_SUBMITTED", responses: null, derived: null })).toEqual([]);
  });
  it("retains all eight movements, including leg press, and excludes duplicate availability", () => {
    const sections = acquisitionSections(submitted());
    for (const key of WEEK_ZERO_MOVEMENT_KEYS) expect(sections.some(s => s.id === key)).toBe(true);
    expect(sections.some(s => s.id === "availability")).toBe(false);
  });
  it("shows a skipped movement with its reason and no fabricated repetitions or load", () => {
    const entry = { ...EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES.loads.legPress, status: "NOT_PERFORMED" as const, reason: "Machine indisponible" };
    expect(calibrationItems(entry, "legPress")).toEqual([
      { label: "État", value: "Non réalisé — à revoir avec le Coach" },
      { label: "Raison", value: "Machine indisponible" },
      { label: "Note", value: "Non renseigné" },
    ]);
  });
  it("distinguishes assistance, added load, per-hand weight and bodyweight", () => {
    const entry = { ...EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES.loads.pullUps, status: "DONE" as const, variant: "PULL_UPS", reps: 8, rir: null, unit: "KG" as const, load: 20 };
    for (const [mode, ending] of [["ASSISTED", "d’assistance"], ["ADDED", "ajoutés"]] as const) {
      expect(calibrationItems({ ...entry, mode }, "pullUps").find(i => i.label === "Charge")?.value).toBe(`20 kg ${ending}`);
    }
    expect(calibrationItems({ ...entry, variant: "DUMBBELL_PRESS", mode: "PER_HAND" }, "horizontalPress").find(i => i.label === "Charge")?.value).toBe("20 kg par haltère");
    expect(calibrationItems({ ...entry, mode: "BODYWEIGHT", unit: null, load: null }, "pullUps").find(i => i.label === "Charge")?.value).toBe("Poids du corps");
    expect(calibrationItems(entry, "lunge").some(i => i.label === "Répétitions par côté")).toBe(true);
  });
  it("never displays a stale VO2 value for a skipped cardio test", () => {
    const snapshot = submitted();
    snapshot.responses!.cardio = { ...snapshot.responses!.cardio, status: "NOT_PERFORMED", reason: "Rameur absent" };
    const section = acquisitionSections(snapshot).find(s => s.id === "cardio")!;
    expect(section.items.some(i => i.value === "Rameur absent")).toBe(true);
    expect(section.items.some(i => i.label.includes("VO₂"))).toBe(false);
  });
  it("labels the official result as an estimate and preserves source inputs", () => {
    const snapshot = submitted();
    snapshot.responses!.cardio = { status: "DONE", reason: null, age: 40, weightKg: 90, sex: "MALE", trainingLevel: "NOT_HIGHLY_TRAINED", totalSeconds: 450, notes: null };
    snapshot.derived = deriveWeekZeroAcquisition(snapshot.responses!);
    const section = acquisitionSections(snapshot).find(s => s.id === "cardio")!;
    expect(section.items).toContainEqual({ label: "VO₂max estimé — pas une mesure de laboratoire", value: "43.9 mL/kg/min" });
    expect(section.items).toContainEqual({ label: "Poids utilisé pour le calcul", value: "90 kg" });
  });
  it("does not label an untested movement pain-free", () => {
    const snapshot = submitted(); snapshot.responses!.mobility.painCardio = "NOT_PERFORMED";
    expect(acquisitionSections(snapshot).find(s => s.id === "mobility")!.items).toContainEqual({ label: "Douleur cardio", value: "Non testé" });
  });
  it("carries seconds on rounding instead of showing 7:60", () => {
    expect(formatSeconds(479.96)).toBe("8:00.0");
  });
});
