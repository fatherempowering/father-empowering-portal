import { matchesExerciseMuscleGroup } from "../exercise-picker-groups";
import type { ExerciseUsageCounts } from "../exercise-usage";
import { exercisePilotListSchema, exercisePilotQuerySchema, pilotExerciseSchema, type ExercisePilotQuery, type PilotExercise } from "@/lib/contracts/exercise-pilot";
import { pilotProgramExerciseSchema, type PilotProgramExercise } from "@/lib/contracts/training-pilot";
import { buildPilotCatalog, PILOT_IDS, type PilotSource } from "./model";
import { canonicalExerciseSearch, isUpperBodySearch, normalizeExerciseSearch, splitExerciseSearch, UPPER_BODY_MUSCLES } from "./search-aliases";

type Labels = { fr: string; en: string };
export type CatalogueSource = {
  catalogVersion: string; sourceSha256: string; integrationVersion: string; preservedPilotIds: string[];
  equipmentOptions: { id: string; labels: Labels }[];
  anatomyConcepts: { id: string; labels: Labels; anatomical_aliases: { fr: string[]; en: string[] } }[];
  searchGroups: { id: string; terms: string[]; target_concept_ids: string[]; coverage_sets?: string[][] }[];
  searchExpansions: { concept_id: string; include_ids: string[] }[];
  exercises: { replacesSourceVersion?: string | null; item: unknown; loadEntryBasis: string; searchTerms: string[]; equipmentIds: string[] }[];
};
export type CatalogueIndex = ReturnType<typeof buildCatalogueIndex>;

// Only server repositories import the data. The index itself is pure for the
// isolated test harness and never grants an exercise-selection permission.
export function buildCatalogueIndex(source: CatalogueSource, legacy: PilotSource, coverage?: Omit<CatalogueSource, "preservedPilotIds"> & { baseCatalogVersion: string }) {
  if (source.catalogVersion !== "4.0.0-unified.1" || source.integrationVersion !== "fe-catalogue.1" ||
      !/^[a-f0-9]{64}$/.test(source.sourceSha256) || source.exercises.length !== 1171 ||
      JSON.stringify(source.preservedPilotIds) !== JSON.stringify(PILOT_IDS)) throw new Error("INVALID_CATALOGUE_SCOPE");
  const old = buildPilotCatalog(legacy);
  const rows = source.exercises.map(row => ({ ...row, sourceCatalogVersion: "4.0.0-unified.1" as "3.1.0-pilot.1" | "4.0.0-unified.1" | "4.1.0-coverage.1", item: pilotExerciseSchema.parse(row.item) }));
  for (const item of old.items) {
    const raw = legacy.exercises.find(x => x.id === item.id)!;
    rows.push({
      sourceCatalogVersion: "3.1.0-pilot.1", item: { ...item, selection: { canSelect: true, reason: null } }, loadEntryBasis: raw.performance.load_entry_basis,
      equipmentIds: [item.equipment.id],
      searchTerms: [item.id, ...Object.values(item.name), ...Object.values(raw.aliases).flat(), ...Object.values(item.equipment.labels), ...Object.values(raw.movement_family.labels), raw.movement_family.specific_family_fr],
    });
  }
  if (new Set(rows.map(row => row.item.id)).size !== 1186 || rows.some(row => !row.item.selection)) throw new Error("INVALID_CATALOGUE_IDENTITIES");
  if (coverage) {
    if (coverage.baseCatalogVersion !== source.catalogVersion || coverage.catalogVersion !== "4.1.0-coverage.1" || coverage.integrationVersion !== "fe-coverage.1" ||
        !/^[a-f0-9]{64}$/.test(coverage.sourceSha256) || coverage.exercises.length !== 195) throw new Error("INVALID_COVERAGE_SCOPE");
    const deltaIds = new Set<string>();
    let additions = 0, revisions = 0;
    for (const row of coverage.exercises) {
      const item = pilotExerciseSchema.parse(row.item);
      if (deltaIds.has(item.id) || !item.selection) throw new Error("COVERAGE_IDENTITY_CONFLICT");
      deltaIds.add(item.id);
      const previousIndex = rows.findIndex(existing => existing.item.id === item.id);
      const next = { ...row, item, sourceCatalogVersion: "4.1.0-coverage.1" as const };
      if (previousIndex >= 0) {
        const previous = rows[previousIndex].item;
        const before = previous.sourceVersion.split(".").map(Number);
        const after = item.sourceVersion.split(".").map(Number);
        const changedPart = after.findIndex((value, index) => value !== before[index]);
        if (row.replacesSourceVersion !== previous.sourceVersion || changedPart < 0 || after[changedPart] < before[changedPart]) throw new Error("COVERAGE_REVISION_CONFLICT");
        rows[previousIndex] = next; revisions++;
      } else {
        if (row.replacesSourceVersion !== null) throw new Error("COVERAGE_REVISION_CONFLICT");
        rows.push(next); additions++;
      }
    }
    if (additions !== 140 || revisions !== 55 || rows.length !== 1326) throw new Error("INVALID_COVERAGE_IDENTITIES");
  }
  const active = coverage ?? source;
  const indexed = rows.map(row => ({ ...row, searchTokens: new Set(canonicalExerciseSearch(row.searchTerms.join(" ")).split(" ")) }));
  // Also validates the equipment vocabulary without exporting every record.
  const empty = exercisePilotListSchema.parse({
    sourceCatalogVersion: active.catalogVersion, integrationVersion: active.integrationVersion,
    items: [], total: 0, catalogSize: rows.length, equipmentOptions: active.equipmentOptions,
    pagination: { offset: 0, limit: 50, hasMore: false },
  });
  return { rows: indexed, source: active, metadata: empty };
}

const stopwords = new Set("a an the with of on au aux avec de des du en le la les pour sur un une et".split(" "));
export function queryCatalogue(index: CatalogueIndex, input: ExercisePilotQuery, usageCounts: ExerciseUsageCounts = {}) {
  const filters = exercisePilotQuerySchema.parse(input);
  const search = splitExerciseSearch(filters.query);
  const query = search.query;
  const equipment = filters.equipment || search.equipment;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  const conflictingEquipment = filters.equipment && search.equipment && filters.equipment !== search.equipment;
  let targets: string[] | null = isUpperBodySearch(query) ? [...UPPER_BODY_MUSCLES] : null;
  let coverage: string[][] | undefined;
  for (const concept of index.source.anatomyConcepts) {
    if ([...Object.values(concept.labels), ...concept.anatomical_aliases.fr, ...concept.anatomical_aliases.en].some(term => canonicalExerciseSearch(term) === query)) { targets = [concept.id]; break; }
  }
  for (const group of index.source.searchGroups) {
    if (group.terms.some(term => canonicalExerciseSearch(term) === query)) { targets = [...group.target_concept_ids]; coverage = group.coverage_sets; break; }
  }
  if (targets) {
    const original = [...targets];
    targets = [...new Set([...targets, ...index.source.searchExpansions.filter(e => original.includes(e.concept_id)).flatMap(e => e.include_ids)])];
  }
  const words = query.split(" ").filter(word => word && !stopwords.has(word));
  const scored: { item: PilotExercise; score: number }[] = [];
  if (!conflictingEquipment) for (const row of index.rows) {
    const item = row.item;
    if (!matchesExerciseMuscleGroup(item.muscles, filters.muscleGroup)) continue;
    if (equipment && !row.equipmentIds.includes(equipment)) continue;
    if (!query) { scored.push({ item, score: 0 }); continue; }
    const compactId = filters.query.trim().replace(/_/g, "").toUpperCase();
    if (/^[A-Z]{2,4}\d{3}$/.test(compactId) && item.id.replace("_", "") === compactId) { scored.push({ item, score: 1000 }); continue; }
    if (targets) {
      const primary = item.muscles.primary.filter(muscle => targets.includes(muscle.id));
      const secondary = item.muscles.secondary.filter(muscle => targets.includes(muscle.id));
      const stabilizers = filters.stabilizers === "true" ? item.muscles.stabilizers.filter(muscle => targets.includes(muscle.id)) : [];
      const found = new Set([...primary, ...secondary, ...stabilizers].map(muscle => muscle.id));
      if (!found.size) continue;
      const covered = coverage ? coverage.filter(set => set.some(id => found.has(id))).length : 1;
      scored.push({ item, score: covered * 100 + primary.length * 10 + secondary.length });
    } else if (words.length && words.every(word => row.searchTokens.has(word))) {
      scored.push({ item, score: Object.values(item.name).some(name => normalizeExerciseSearch(name) === query) ? 80 : 20 });
    }
  }
  const matches = scored.sort((a, b) => filters.sort === "usage"
    ? (usageCounts[`pilot:${b.item.id}`] ?? 0) - (usageCounts[`pilot:${a.item.id}`] ?? 0) || b.score - a.score || a.item.name.fr.localeCompare(b.item.name.fr, "fr") || a.item.id.localeCompare(b.item.id)
    : b.score - a.score || a.item.id.localeCompare(b.item.id));
  return exercisePilotListSchema.parse({
    ...index.metadata, items: matches.slice(offset, offset + limit).map(match => match.item), total: matches.length,
    pagination: { offset, limit, hasMore: offset + Math.min(limit, Math.max(0, matches.length - offset)) < matches.length },
  });
}

export function buildNewCatalogueProgramSnapshots(index: CatalogueIndex): PilotProgramExercise[] {
  return index.rows.filter(row => row.sourceCatalogVersion !== "3.1.0-pilot.1" && row.item.selection?.canSelect).map(row =>
    pilotProgramExerciseSchema.parse({
      sourceId: row.item.id, sourceVersion: row.item.sourceVersion, sourceCatalogVersion: row.sourceCatalogVersion,
      integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST", name: row.item.name,
      equipment: row.item.equipment, instructions: row.item.instructions,
      performance: { ...row.item.performance, loadEntryBasis: row.loadEntryBasis },
    }));
}
