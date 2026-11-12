import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import source from "@/lib/training/pilot/catalogue-source.json";
import coverage from "@/lib/training/pilot/catalogue-coverage-source.json";
import pilot from "@/lib/training/pilot/source.json";
import { buildCatalogueIndex, buildNewCatalogueProgramSnapshots, queryCatalogue } from "@/lib/training/pilot/catalogue";
import { exercisePilotQuerySchema, exercisePilotListSchema } from "@/lib/contracts/exercise-pilot";
import { pilotDefaultUnit, pilotProgramExerciseSchema } from "@/lib/contracts/training-pilot";

const original = buildCatalogueIndex(source, pilot);
const current = buildCatalogueIndex(source, pilot, coverage);
const query = (input: unknown) => queryCatalogue(current, exercisePilotQuerySchema.parse(input));

describe("additive coverage without rewriting client exercise identities", () => {
  it("uses current revisions while retaining the original snapshot builders unchanged", () => {
    expect(current.rows).toHaveLength(1326);
    expect(new Set(current.rows.map(row => row.item.id)).size).toBe(1326);
    const revisedIds = new Set(coverage.exercises.filter(row => row.replacesSourceVersion !== null).map(row => row.item.id));
    for (const row of original.rows) {
      if (!revisedIds.has(row.item.id)) expect(current.rows.find(next => next.item.id === row.item.id)).toEqual(row);
      else expect(current.rows.find(next => next.item.id === row.item.id)?.item.sourceVersion).not.toBe(row.item.sourceVersion);
    }
    const oldSnapshots = buildNewCatalogueProgramSnapshots(original);
    const snapshots = buildNewCatalogueProgramSnapshots(current);
    for (const snapshot of oldSnapshots.filter(row => !revisedIds.has(row.sourceId))) expect(snapshots.find(next => next.sourceId === snapshot.sourceId)).toEqual(snapshot);
    expect(current.rows.every(row => row.item.media === null && row.item.instructionReview === "PENDING" && !row.item.canPrescribe)).toBe(true);
  });

  it("provides 140 new records, while preserving unsupported conventions as read-only", () => {
    expect(coverage.exercises.filter(row => row.replacesSourceVersion === null)).toHaveLength(140);
    expect(coverage.exercises.filter(row => row.replacesSourceVersion !== null)).toHaveLength(55);
    expect(coverage.exercises.filter(row => row.item.selection.canSelect)).toHaveLength(109);
    expect(query({query: "COVL_014"}).items[0].selection).toEqual({canSelect:false,reason:"UNSUPPORTED_CONFIGURATION"});
    expect(query({query: "COVL001"}).items[0].id).toBe("COVL_001");
    expect(query({query: "COVL_004"}).items[0].id).toBe("COVL_004");
    expect(current.rows.filter(row => row.item.selection?.canSelect)).toHaveLength(769);
  });

  it("paginates through the full mixed catalog without exposing reference media or source URLs", () => {
    expect(query({})).toMatchObject({total:1326,catalogSize:1326,sourceCatalogVersion:"4.1.0-coverage.1"});
    expect(query({offset:1300}).items).toHaveLength(26);
    expect(query({offset:1300}).pagination?.hasMore).toBe(false);
    expect(query({offset:1350}).items).toEqual([]);
    const all = Array.from({length:27},(_,i)=>query({offset:i*50})).flatMap(page=>page.items);
    expect(new Set(all.map(item=>item.id)).size).toBe(1326);
    for(const forbidden of ["https://","http://","image_reference_urls","sourceSha256","approved_by"])
      expect(JSON.stringify(all)).not.toContain(forbidden);
    expect(exercisePilotListSchema.safeParse({...query({}),catalogSize:1186}).success).toBe(false);
  });

  it("generates only additive SQL with repeat/conflict handling and unchanged old migrations", () => {
    const sql=readFileSync("supabase/migrations/202611120001_training_catalogue_coverage.sql","utf8");
    const seed=JSON.parse(sql.split("$coverage_seed$")[1]);
    const snapshots=buildNewCatalogueProgramSnapshots(current).filter(x=>x.sourceCatalogVersion==="4.1.0-coverage.1");
    expect(snapshots).toHaveLength(109);
    expect(seed.sort((a: {source_id:string},b: {source_id:string})=>a.source_id.localeCompare(b.source_id))).toEqual(snapshots.map(p=>({source_id:p.sourceId,pilot:p,default_unit:pilotDefaultUnit(p)})).sort((a,b)=>a.source_id.localeCompare(b.source_id)));
    expect(sql).toContain("on conflict(source_id,source_version) do nothing");
    expect(sql).toContain("FE_COVERAGE_IDENTITY_CONFLICT");
    expect(sql).toContain("lock table app_private.training_pilot_catalog in access exclusive mode");
    expect(sql).not.toMatch(/\b(?:grant|revoke|policy|truncate|delete|update\s+public\.|create\s+or\s+replace\s+function\s+public\.)\b/i);
    for(const snapshot of snapshots) expect(pilotProgramExerciseSchema.safeParse(snapshot).success).toBe(true);
  });

  it("reports revised pilot identities and preserves the per-arm product decision", () => {
    const report = JSON.parse(readFileSync("../../docs/quality/CATALOGUE-COVERAGE-IMPORT.json", "utf8"));
    expect(report.revisedIdentities).toHaveLength(55);
    expect(Object.fromEntries(current.rows.map(row => [row.item.id, row.item.sourceVersion]))).toEqual(report.currentVersions);
    for (const item of pilot.exercises) expect(report.revisedIdentities.some((row: {id:string}) => row.id === item.id)).toBe(true);
    const updatedCurl = current.rows.find(row => row.item.id === "DB_034")!.item;
    expect(updatedCurl.sourceVersion).toBe("1.3.0");
    expect(updatedCurl.performance.countingDecision).toBe("MAX_PER_ARM_2026_10_23");
    expect(updatedCurl.performance.counting.fr).toBe("Répétitions par bras");
    expect(report.approvalsGranted).toBe(false);
    expect(report.mediaPublished).toBe(false);
  });

  it("fails closed on duplicate identities and malformed coverage", () => {
    expect(()=>buildCatalogueIndex(source,pilot,{...coverage,baseCatalogVersion:"wrong"})).toThrow("INVALID_COVERAGE_SCOPE");
    const duplicate=structuredClone(coverage);
    duplicate.exercises[0].item.id=duplicate.exercises[1].item.id;
    duplicate.exercises[0].replacesSourceVersion=duplicate.exercises[1].replacesSourceVersion;
    duplicate.exercises[0].item.sourceVersion=duplicate.exercises[1].item.sourceVersion;
    expect(()=>buildCatalogueIndex(source,pilot,duplicate)).toThrow("COVERAGE_IDENTITY_CONFLICT");
    const downgrade = structuredClone(coverage);
    downgrade.exercises[0].item.sourceVersion = downgrade.exercises[0].replacesSourceVersion!;
    expect(()=>buildCatalogueIndex(source,pilot,downgrade)).toThrow("COVERAGE_REVISION_CONFLICT");
    expect(()=>buildCatalogueIndex(source,pilot,{...coverage,exercises:coverage.exercises.slice(1)})).toThrow("INVALID_COVERAGE_SCOPE");
  });
});
