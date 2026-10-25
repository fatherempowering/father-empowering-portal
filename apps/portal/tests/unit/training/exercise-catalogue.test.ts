import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import source from "@/lib/training/pilot/catalogue-source.json";
import pilotSource from "@/lib/training/pilot/source.json";
import { buildPilotCatalog, PILOT_IDS } from "@/lib/training/pilot/model";
import { buildCatalogueIndex, buildNewCatalogueProgramSnapshots, queryCatalogue } from "@/lib/training/pilot/catalogue";
import { exercisePilotQuerySchema, exercisePilotListSchema } from "@/lib/contracts/exercise-pilot";
import { pilotDefaultUnit, pilotProgramExerciseSchema } from "@/lib/contracts/training-pilot";

const index = buildCatalogueIndex(source, pilotSource);
const query = (input: unknown) => queryCatalogue(index, exercisePilotQuerySchema.parse(input));

describe("versioned expanded catalogue — staging only", () => {
  it("contains 1186 distinct editorial records, preserving the fifteen approved pilot integration snapshots", () => {
    expect(index.rows).toHaveLength(1186);
    expect(new Set(index.rows.map(row => row.item.id)).size).toBe(1186);
    for (const item of buildPilotCatalog(pilotSource).items) {
      const row = index.rows.find(row => row.item.id === item.id)!;
      expect(row.item).toEqual({ ...item, selection: { canSelect: true, reason: null } });
    }
    expect(index.rows.filter(row => row.item.selection?.canSelect)).toHaveLength(689);
    expect(index.rows.every(row => row.item.instructionReview === "PENDING" && row.item.media === null && row.item.canPrescribe === false)).toBe(true);
  });

  it("paginates deterministically, reports total matches, and does not ship the full source or documentary URLs", () => {
    const first = query({});
    const second = query({ offset: 50, limit: 50 });
    expect(first).toMatchObject({ total: 1186, catalogSize: 1186, pagination: { offset: 0, limit: 50, hasMore: true } });
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    expect(first.items.some(x => second.items.some(y => x.id === y.id))).toBe(false);
    expect(query({ offset: 1150 }).items).toHaveLength(36);
    expect(query({ offset: 1150 }).pagination?.hasMore).toBe(false);
    expect(query({ offset: 1200 }).items).toEqual([]);
    const wire = JSON.stringify(first);
    for (const forbidden of ["sourceSha256", "searchTerms", "searchTokens", "http://", "https://", "approved_by", "documentary_notes", "image_reference_urls"]) expect(wire).not.toContain(forbidden);
    expect(Buffer.byteLength(wire)).toBeLessThan(250_000);
    expect(first.equipmentOptions).toHaveLength(21);
  });

  it("exposes new cable Pallof, chest and mobility results without fictional machine equivalence", () => {
    const pallof = query({ query: "Palloff à la poulie" });
    expect(pallof.total).toBeGreaterThan(0);
    expect(pallof.items.every(x => x.equipment.id === "cable")).toBe(true);
    expect(pallof.items.every(x => /pallof/i.test(x.name.fr))).toBe(true);
    expect(query({ query: "chest" }).items.some(x => x.id === "BW_021")).toBe(true);
    expect(query({ query: "mobilité" }).total).toBe(182);
    expect(query({ query: "MO_001" }).items.map(x => x.id)).toEqual(["MO_001"]);
    expect(query({ query: "MOBX001" }).items.map(x => x.id)).toEqual(["MOBX_001"]);
    expect(query({ query: "abs cable", equipment: "band" }).total).toBe(0);
    expect(query({ query: "zzznothing" }).total).toBe(0);
    expect(query({ query: "le" }).total).toBe(0);
  });

  it("does not infer a scalar mass for two independent dumbbells or unknown machine resistance", () => {
    expect(query({ query: "DB_002" }).items[0].selection).toEqual({ canSelect: false, reason: "MULTIPLE_LOAD_COMPONENTS" });
    const unknown = index.rows.find(row => row.item.selection?.reason === "AMBIGUOUS_LOAD_BASIS")!;
    expect(unknown.item.selection?.canSelect).toBe(false);
    const passes = index.rows.filter(row => row.item.performance.measure === "passes");
    expect(passes).toHaveLength(11);
    expect(passes.every(row => row.item.selection?.reason === "UNSUPPORTED_MEASURE")).toBe(true);
    const timedBands = index.rows.filter(row => row.item.performance.measure === "duration" && row.loadEntryBasis === "band_configuration");
    expect(timedBands).toHaveLength(2);
    expect(timedBands.every(row => row.item.selection?.reason === "UNSUPPORTED_CONFIGURATION")).toBe(true);
    expect(index.rows.filter(row => row.item.selection?.canSelect && !PILOT_IDS.includes(row.item.id as typeof PILOT_IDS[number])).every(row => !["to_confirm", "equipment_configuration", "configuration_only_no_force_conversion"].includes(row.loadEntryBasis))).toBe(true);
  });

  it("seeds exactly the selectable new snapshots and leaves old seed/permissions/auth guards untouched", () => {
    const snapshots = buildNewCatalogueProgramSnapshots(index);
    expect(snapshots).toHaveLength(674);
    const sql = readFileSync("supabase/migrations/202610250002_training_catalogue.sql", "utf8");
    const seed = JSON.parse(sql.split("$catalogue_seed$")[1]);
    expect(sql).toContain("'^(DB|BB|CA|MA|BW|KB|BA|LM|MB|SB|SL|SU|PL|BR|ER|CO|MO|MOBX|ATH)_[0-9]{3}$'");
    expect(sql.match(/end \$\$;/g)).toHaveLength(1);
    expect(seed).toEqual(snapshots.map(pilot => ({ source_id: pilot.sourceId, pilot, default_unit: pilotDefaultUnit(pilot) })));
    expect(seed.every((x: { source_id: string }) => !PILOT_IDS.includes(x.source_id as typeof PILOT_IDS[number]))).toBe(true);
    expect(sql).not.toMatch(/\b(?:grant|revoke|policy|truncate|delete|update\s+public\.|create\s+or\s+replace\s+function\s+public\.)\b/i);
    for (const snapshot of snapshots) {
      expect(pilotProgramExerciseSchema.safeParse(snapshot).success).toBe(true);
      expect(snapshot.usage).toBe("STAGING_TEST");
      expect(snapshot.sourceCatalogVersion).toBe("4.0.0-unified.1");
      expect(snapshot).not.toHaveProperty("machines");
    }
  });

  it.each([{ offset: -1 }, { offset: "1.2" }, { offset: "" }, { limit: 0 }, { limit: 51 }, { equipment: "invented" }])("rejects invalid pagination/filter %j", input => {
    expect(exercisePilotQuerySchema.safeParse(input).success).toBe(false);
  });

  it("rejects dishonest pagination and does not let a caller mutate the cached index", () => {
    const result = query({ limit: 1 });
    expect(exercisePilotListSchema.safeParse({ ...result, total: 0 }).success).toBe(false);
    expect(exercisePilotListSchema.safeParse({ ...result, pagination: { offset: 0, limit: 1, hasMore: false } }).success).toBe(false);
    result.items[0].name.fr = "Changed by caller";
    expect(query({ limit: 1 }).items[0].name.fr).not.toBe("Changed by caller");
  });
});
