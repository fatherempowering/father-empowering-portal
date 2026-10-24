import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import source from "@/lib/training/pilot/source.json";
import { buildPilotCatalog, PILOT_IDS, queryPilotCatalog } from "@/lib/training/pilot/model";
import { exercisePilotListSchema, exercisePilotQuerySchema } from "@/lib/contracts/exercise-pilot";
import { saveExerciseRequestSchema, exerciseSnapshotSchema } from "@/lib/contracts/training";
import cases from "./pilot-search-cases.json";

describe("15-exercise pilot — separate, versioned, read-only review", () => {
  it("projects exactly fifteen drafts and seven blocked machine links, without media or approval", () => {
    const value = buildPilotCatalog(source);
    expect(value.items.map((item) => item.id)).toEqual(PILOT_IDS);
    expect(value.equipmentOptions).toHaveLength(7);
    expect(value.items.flatMap((item) => item.machines)).toHaveLength(7);
    for (const item of value.items) {
      expect(item).toMatchObject({ status: "DRAFT", canPrescribe: false, instructionReview: "PENDING", media: null });
      expect(item.machines.every((machine) => machine.publishable === false)).toBe(true);
      expect(exerciseSnapshotSchema.safeParse(item).success).toBe(false);
    }
    const json = JSON.stringify(value);
    for (const absent of ["http://", "https://", "approved_by", "source_refs", "serverOnlyMarker", "catalogSha256", "sourceSchema", "anatomical_aliases"]) expect(json).not.toContain(absent);
  });
  it.each(cases)("reproduces the supplied reference search: $query / stabilizers=$stabilizers", (example) => {
    const query = exercisePilotQuerySchema.parse(example.query ? { query: example.query, equipment: example.equipment, stabilizers: example.stabilizers } : {});
    expect(queryPilotCatalog(source, query).items.map((item) => item.id)).toEqual(example.ids);
  });
  it("supports combined equipment/muscle filters and empty browsing without broadening anatomy", () => {
    const query = (input: unknown) => queryPilotCatalog(source, exercisePilotQuerySchema.parse(input));
    expect(query({ query: "ischio-fessiers", equipment: "barbell" }).items.map((item) => item.id)).toEqual(["BB_012", "BB_001"]);
    expect(query({ equipment: "bodyweight" }).items.map((item) => item.id)).toEqual(["BW_021", "BW_049"]);
    expect(query({ query: "" }).total).toBe(15);
    expect(query({ query: "introuvable" }).total).toBe(0);
    expect(query({ query: "le" }).total).toBe(0);
  });
  it("preserves all three complete instructions and both languages, with only the explicit per-arm overlay", () => {
    const before = JSON.stringify(source);
    const result = buildPilotCatalog(source);
    for (const item of result.items) {
      const original = source.exercises.find((exercise) => exercise.id === item.id)!;
      for (const language of ["fr", "en"] as const) {
        for (const step of ["setup", "execution", "finish"] as const) {
          if (item.id === "DB_034" && step === "finish") continue;
          expect(item.instructions[language][step]).toBe(original.client_instructions[language][step]);
        }
      }
    }
    const curl = result.items.find((item) => item.id === "DB_034")!;
    expect(curl.performance.countingDecision).toBe("MAX_PER_ARM_2026_10_23");
    expect(curl.performance.counting.fr).toBe("Répétitions par bras");
    expect(curl.instructions.en.finish).toContain("each arm separately");
    expect(curl.sourceVersion).toBe("1.2.0");
    expect(curl.instructionReview).toBe("PENDING");
    expect(result.items.filter((item) => item.performance.countingDecision !== "PROPOSED")).toHaveLength(1);
    result.items[0].instructions.fr.setup = "changed view";
    expect(JSON.stringify(source)).toBe(before);
    expect(buildPilotCatalog(source).items[0].instructions.fr.setup).not.toBe("changed view");
  });
  it("keeps the knee-pad versus foot-platform mismatch explicit in both languages", () => {
    const machine = buildPilotCatalog(source).items.find((item) => item.id === "MA_028")!.machines[0];
    expect(machine).toMatchObject({ modelId: "HST_RS2700", evidence: "inferred_family", publishable: false });
    expect(machine.warning.fr).toContain("plateau de pieds");
    expect(machine.warning.en).toContain("not the knee pad");
  });
  it.each(["duplicate", "stale", "machine", "approval", "count-approval", "muscle", "unknown-load", "unknown-measure"])("fails closed on corrupted source %s", (kind) => {
    const changed = structuredClone(source);
    if (kind === "duplicate") changed.exercises[1] = changed.exercises[0];
    if (kind === "stale") changed.exercises[0].previous_version = "0.1.0";
    if (kind === "machine") changed.machines[0].exercise_version = "7.0.0";
    if (kind === "approval") changed.exercises[0].validations.instructions.review_status = "approved";
    if (kind === "count-approval") changed.exercises[0].performance.convention_status = "accepted";
    if (kind === "muscle") changed.exercises[0].muscle_roles.secondary.push(changed.exercises[0].muscle_roles.primary[0]);
    if (kind === "unknown-load") changed.exercises[0].performance.load_entry_basis = "random";
    if (kind === "unknown-measure") changed.exercises[0].performance.measure = "random";
    expect(() => buildPilotCatalog(changed)).toThrow();
  });
  it("rejects invented readiness, media and source IDs at the existing write contract", () => {
    const result = buildPilotCatalog(source);
    expect(exercisePilotListSchema.safeParse({ ...result, items: [{ ...result.items[0], canPrescribe: true }] }).success).toBe(false);
    expect(exercisePilotListSchema.safeParse({ ...result, items: [{ ...result.items[0], media: "https://example.test/fake.png" }] }).success).toBe(false);
    expect(saveExerciseRequestSchema.safeParse({ id: "DB_034", expectedVersion: 0, clientMutationId: "10000000-0000-4000-8000-000000000005", exercise: result.items[2] }).success).toBe(false);
  });
  it("has no mutation export, public Client route or source import in the production view", () => {
    const route = readFileSync("src/app/api/v1/coach/exercise-pilot/route.ts", "utf8");
    expect(route).toContain("export const GET");
    expect(route).not.toMatch(/export\s+(?:const|function)\s+(?:POST|PUT|PATCH|DELETE)/);
    const server = readFileSync("src/lib/training/pilot/catalog.server.ts", "utf8");
    expect(server).toContain('import "server-only"');
    const view = readFileSync("src/features/training/coach/exercise-pilot.tsx", "utf8");
    expect(view).not.toMatch(/source\.json|catalog\.server|\.rpc\(/);
  });
});
