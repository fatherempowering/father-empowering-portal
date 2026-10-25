import { exercisePilotListSchema, PILOT_EQUIPMENT, type ExercisePilotQuery } from "../../src/lib/contracts/exercise-pilot";
import { buildPilotCatalog } from "../../src/lib/training/pilot/model";
import source from "../../src/lib/training/pilot/source.json";

// Browser-only pagination fixture. Real catalogue search, canonical snapshots
// and authorization are covered separately by the server/SQL integration gate.
export function catalogueFixture(query: ExercisePilotQuery) {
  const original = buildPilotCatalog(source);
  const all = Array.from({ length: 65 }, (_, index) => ({
    ...structuredClone(original.items[0]),
    id: `DB_${100 + index}`,
    name: { fr: `Exercice catalogue ${index + 1}`, en: `Catalogue exercise ${index + 1}` },
    selection: index === 0
      ? { canSelect: false as const, reason: "MULTIPLE_LOAD_COMPONENTS" as const }
      : { canSelect: true as const, reason: null },
  }));
  const matches = all.filter(item => !query.query || item.name.fr.toLowerCase().includes(query.query.toLowerCase()));
  const offset = query.offset ?? 0, limit = query.limit ?? 50;
  return exercisePilotListSchema.parse({
    ...original, sourceCatalogVersion: "4.0.0-unified.1", integrationVersion: "fe-catalogue.1",
    catalogSize: 1_186, total: matches.length, items: matches.slice(offset, offset + limit),
    equipmentOptions: PILOT_EQUIPMENT.map(id => ({ id, labels: { fr: id, en: id } })),
    pagination: { offset, limit, hasMore: offset + limit < matches.length },
  });
}
