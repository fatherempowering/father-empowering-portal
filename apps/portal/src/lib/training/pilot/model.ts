import { exercisePilotListSchema, exercisePilotQuerySchema, type ExercisePilotQuery, type PilotExercise } from "@/lib/contracts/exercise-pilot";
import type sourceShape from "./source.json";
import { canonicalExerciseSearch, isUpperBodySearch, normalizeExerciseSearch, splitExerciseSearch, UPPER_BODY_MUSCLES } from "./search-aliases";

// Pure projection/search only. The source itself is loaded by the guarded server
// repository, never by a production Client Component.
export type PilotSource = typeof sourceShape;
export const PILOT_IDS = ["DB_001", "DB_025", "DB_034", "DB_045", "BB_001", "BB_012", "CA_001", "CA_050", "MA_018", "MA_028", "MA_063", "BW_021", "BW_049", "KB_015", "BA_027"] as const;
const text = (fr: string, en: string) => ({ fr, en });
const proposed = text("Convention proposée à vérifier avec la fiche; aucune performance n’est enregistrée dans cet aperçu.", "Proposed convention to review with this exercise; this preview does not record a workout.");

function counting(exercise: PilotSource["exercises"][number]) {
  if (exercise.id === "DB_034" || ["DB_025", "CA_050", "MA_063"].includes(exercise.id)) return text("Répétitions par bras", "Repetitions per arm");
  if (exercise.id === "BA_027") return text("Répétitions par côté d’ancrage", "Repetitions per anchor side");
  if (exercise.performance.measure === "duration") return text("Secondes de maintien, sans compter l’installation", "Hold duration in seconds, excluding setup");
  if (exercise.performance.measure === "distance") return text("Distance totale parcourue pendant la série", "Total distance travelled during the set");
  if (exercise.performance.measure === "repetitions") return text("Répétitions complètes", "Complete repetitions");
  throw new Error("INVALID_PILOT_MEASURE");
}

function load(exercise: PilotSource["exercises"][number]) {
  switch (exercise.performance.load_entry_basis) {
    case "per_implement": return text(exercise.performance.load_components.map((part) => part.label_fr).join(" · "), exercise.performance.load_components.map((part) => part.label_en).join(" · "));
    case "total_external_mass": return text("Charge totale réellement utilisée : barre + disques + colliers", "Actual total load: bar + plates + collars");
    case "displayed_stack_setting": return text("Réglage affiché sur la pile utilisée, avec son unité", "Displayed setting on the stack in use, with its unit");
    case "band_configuration": return text("Identifier la bande et son montage; aucune charge en livres ou kilos n’est déduite", "Identify the band and setup; no load in pounds or kilograms is inferred");
    case "not_applicable": return text("Poids du corps : aucune charge externe pour cette variante", "Bodyweight: no external load for this variation");
    case "to_confirm": return text("Base de charge à confirmer sur l’appareil; ne pas déduire la résistance réelle", "Load basis must be confirmed on the machine; do not infer actual resistance");
    default: throw new Error("INVALID_PILOT_LOAD_BASIS");
  }
}

export function buildPilotCatalog(source: PilotSource) {
  if (source.catalogVersion !== "3.1.0-pilot.1" || source.exercises.length !== 15 ||
      source.exercises.some((exercise, index) => exercise.id !== PILOT_IDS[index]) ||
      source.machines.length !== 7 || new Set(source.machines.map((machine) => machine.id)).size !== 7) throw new Error("INVALID_PILOT_SCOPE");
  const concepts = new Map(source.dictionary.anatomy_concepts.map((concept) => [concept.id, concept]));
  const muscle = (id: string) => {
    const concept = concepts.get(id);
    if (!concept) throw new Error("INVALID_PILOT_MUSCLE");
    return { id, labels: concept.labels };
  };
  for (const machine of source.machines) {
    const exercise = source.exercises.find((item) => item.id === machine.exercise_id);
    if (!exercise || exercise.version !== machine.exercise_version || machine.publishable !== false) throw new Error("INVALID_PILOT_MACHINE");
  }
  const items = source.exercises.map((exercise) => {
    const revised = exercise.id === "DB_025" || exercise.id === "DB_034";
    if (exercise.previous_version !== (revised ? "1.1.0" : "1.0.0") || exercise.version !== (revised ? "1.2.0" : "1.1.0")) throw new Error("INVALID_PILOT_REVISION");
    const muscleIds = Object.values(exercise.muscle_roles).flat();
    if (new Set(muscleIds).size !== muscleIds.length) throw new Error("INVALID_PILOT_MUSCLE_ROLES");
    if (exercise.performance.convention_status !== "proposed_pending_cavaliers_acceptance" ||
        exercise.performance.accepted_by !== null || exercise.performance.accepted_at !== null ||
        Object.values(exercise.validations).some((review) => review.review_status !== "pending" || review.approved_by !== null || review.approved_at !== null)) throw new Error("INVALID_PILOT_REVIEW");
    const instructions = structuredClone(exercise.client_instructions);
    if (exercise.id === "DB_034") {
      // Max's product decision is an explicitly versioned overlay, not a human
      // biomechanical approval or a rewrite of the supplier's source revision.
      instructions.fr.finish = "Réalisez le même mouvement avec le bras gauche. Comptez les répétitions pour chaque bras séparément, sans regrouper droite et gauche en une répétition.";
      instructions.en.finish = "Repeat the movement with your left arm. Count repetitions for each arm separately; do not combine right and left into one repetition.";
    }
    return {
      id: exercise.id, sourceVersion: exercise.version, previousVersion: exercise.previous_version,
      name: exercise.name, equipment: exercise.equipment,
      muscles: { primary: exercise.muscle_roles.primary.map(muscle), secondary: exercise.muscle_roles.secondary.map(muscle), stabilizers: exercise.muscle_roles.stabilizers.map(muscle) },
      instructions,
      performance: {
        measure: exercise.performance.measure, counting: counting(exercise), load: load(exercise),
        countingDecision: exercise.id === "DB_034" ? "MAX_PER_ARM_2026_10_23" : "PROPOSED",
        notes: exercise.id === "DB_034" ? text("Comptage par bras retenu par Max. Aucun total n’est divisé par deux. Les consignes techniques restent à vérifier.", "Per-arm counting selected by Max. No total is divided by two. Technical instructions still need review.") : proposed,
      },
      machines: source.machines.filter((machine) => machine.exercise_id === exercise.id).map((machine) => ({
        id: machine.id, modelId: machine.model_id, modelVersion: machine.model_version,
        manufacturer: machine.manufacturer, name: `${machine.model_code} · ${machine.name}`, evidence: machine.evidence,
        warning: text(machine.reason_fr, machine.model_id === "HST_RS2700" ? "The RS-2700 uses a foot platform, not the knee pad described in the generic instructions. Adapt and review the instructions before any client use." : "Adapt and review the instructions for this exact machine and physical configuration before client use."),
        publishable: false,
      })),
      status: "DRAFT", instructionReview: "PENDING", canPrescribe: false, media: null,
    };
  });
  return exercisePilotListSchema.parse({
    sourceCatalogVersion: source.catalogVersion, integrationVersion: "fe-pilot.1", items, total: items.length, catalogSize: 15,
    equipmentOptions: [...new Map(items.map((item) => [item.equipment.id, item.equipment])).values()],
  });
}

export function normalizePilotSearch(value: string) {
  return normalizeExerciseSearch(value);
}
const stopwords = new Set("a an the with of on au aux avec de des du en le la les pour sur un une et".split(" "));

export function queryPilotCatalog(source: PilotSource, input: ExercisePilotQuery) {
  const filters = exercisePilotQuerySchema.parse(input);
  const catalog = buildPilotCatalog(source);
  const search = splitExerciseSearch(filters.query);
  const query = search.query;
  const equipment = filters.equipment || search.equipment;
  if (filters.equipment && search.equipment && filters.equipment !== search.equipment) return exercisePilotListSchema.parse({ ...catalog, items: [], total: 0 });
  let targets: string[] | null = isUpperBodySearch(query) ? [...UPPER_BODY_MUSCLES] : null;
  let coverage: string[][] | undefined;
  for (const concept of source.dictionary.anatomy_concepts) {
    if ([...Object.values(concept.labels), ...concept.anatomical_aliases.fr, ...concept.anatomical_aliases.en].some((term) => normalizePilotSearch(term) === query)) { targets = [concept.id]; break; }
  }
  for (const group of source.dictionary.search_groups) {
    if (group.terms.some((term) => normalizePilotSearch(term) === query)) { targets = [...group.target_concept_ids]; coverage = group.coverage_sets; break; }
  }
  if (targets) {
    const original = [...targets];
    targets = [...new Set([...targets, ...source.dictionary.search_expansions.filter((expansion) => original.includes(expansion.concept_id)).flatMap((expansion) => expansion.include_ids)])];
  }
  const words = query.split(" ").filter((word) => word && !stopwords.has(word));
  const scored: { item: PilotExercise; score: number }[] = [];
  for (const item of catalog.items) {
    if (equipment && item.equipment.id !== equipment) continue;
    if (!query) { scored.push({ item, score: 0 }); continue; }
    const compactId = filters.query.trim().replace(/_/g, "").toUpperCase();
    if (/^[A-Z]{2}\d{3}$/.test(compactId) && item.id.replace("_", "") === compactId) { scored.push({ item, score: 1000 }); continue; }
    if (targets) {
      const primary = item.muscles.primary.filter((muscle) => targets.includes(muscle.id));
      const secondary = item.muscles.secondary.filter((muscle) => targets.includes(muscle.id));
      const stabilizers = filters.stabilizers === "true" ? item.muscles.stabilizers.filter((muscle) => targets.includes(muscle.id)) : [];
      const found = new Set([...primary, ...secondary, ...stabilizers].map((muscle) => muscle.id));
      if (!found.size) continue;
      const covered = coverage ? coverage.filter((set) => set.some((id) => found.has(id))).length : 1;
      scored.push({ item, score: covered * 100 + primary.length * 10 + secondary.length });
    } else {
      if (!words.length) continue;
      const raw = source.exercises.find((exercise) => exercise.id === item.id)!;
      const fields = [raw.id, ...Object.values(raw.name), ...raw.aliases.fr, ...raw.aliases.en, ...raw.aliases.legacy_unclassified, ...Object.values(raw.equipment.labels), ...Object.values(raw.movement_family.labels), raw.movement_family.specific_family_fr];
      const tokens = new Set(canonicalExerciseSearch(fields.join(" ")).split(" "));
      if (!words.every((word) => tokens.has(word))) continue;
      scored.push({ item, score: Object.values(item.name).some((name) => normalizePilotSearch(name) === query) ? 80 : 20 });
    }
  }
  const items = scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)).map((match) => match.item);
  return exercisePilotListSchema.parse({ ...catalog, items, total: items.length });
}
