// Deterministic documentary import. It does not contact any service or database.
// Usage: node scripts/m1-import-exercise-catalogue.mjs /absolute/CATALOGUE_REFERENCE.json
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const sourcePath = process.argv[2];
if (!sourcePath?.startsWith("/")) throw new Error("An absolute catalogue source path is required");
const bytes = await readFile(sourcePath);
const source = JSON.parse(bytes);
if (source.catalog_version !== "4.0.0-unified.1" || source.exercises.length !== 1186 || source.media_assets.length !== 0 || new Set(source.exercises.map(x => x.id)).size !== 1186) throw new Error("Unexpected catalogue revision");
const legacyIds = new Set(["DB_001", "DB_025", "DB_034", "DB_045", "BB_001", "BB_012", "CA_001", "CA_050", "MA_018", "MA_028", "MA_063", "BW_021", "BW_049", "KB_015", "BA_027"]);
const labels = {
  dumbbell: ["Haltères", "Dumbbells"], barbell: ["Barres", "Barbells"], cable: ["Câbles", "Cables"], machine: ["Machines", "Machines"],
  bodyweight: ["Poids du corps", "Bodyweight"], kettlebell: ["Kettlebells", "Kettlebells"], band: ["Élastiques", "Resistance bands"],
  medicine_ball: ["Médecine-balls", "Medicine balls"], sandbag: ["Sacs lestés", "Sandbags"], sled: ["Traîneaux", "Sleds"],
  suspension: ["Suspension et anneaux", "Suspension and rings"], plyometric: ["Pliométrie et agilité", "Plyometrics and agility"],
  battle_rope: ["Cordes ondulatoires", "Battle ropes"], ergometer: ["Ergomètres et cardio", "Ergometers and cardio"],
  conditioning: ["Conditionnement", "Conditioning"], chair: ["Chaise", "Chair"], foam_roller: ["Rouleau de massage", "Foam roller"],
  massage_ball: ["Balle de massage", "Massage ball"], yoga_mat: ["Tapis", "Mat"], support_surface: ["Surface d’appui", "Support surface"], wall: ["Mur", "Wall"],
};
const text = (fr, en) => ({ fr, en });
const concepts = new Map(source.anatomy_concepts.map(c => [c.id, c]));
const models = new Map(source.machine_models.map(m => [m.id, m]));
const notes = text("Fiche éditoriale à vérifier, utilisable uniquement pour les essais staging. Aucun modèle de machine ni média n’est approuvé. Aucune résistance réelle n’est calculée automatiquement.", "Editorial exercise requiring review, for staging tests only. No machine model or media is approved. Actual resistance is never calculated automatically.");
const fallbackLoad = {
  per_implement: text("Masse de l’objet réellement utilisé, unité explicite.", "Actual mass of the implement in use, with an explicit unit."),
  total_external_mass: text("Masse externe totale réellement utilisée, unité explicite.", "Actual total external mass in use, with an explicit unit."),
  displayed_stack_setting: text("Réglage affiché sur l’appareil; aucune résistance réelle déduite.", "Displayed equipment setting; actual resistance is not inferred."),
  not_applicable: text("Aucune charge externe ajoutée; aucune conversion de pression ou de traction en force.", "No added external load; pressure or traction is not converted into force."),
  band_configuration: text("Identifier la bande et son montage; aucune conversion en masse ou en force.", "Identify the band and setup; do not convert into mass or force."),
  to_confirm: text("Base de charge à confirmer avant utilisation; aucune valeur n’est inventée.", "Load basis must be confirmed before use; no value is invented."),
  equipment_configuration: text("Décrire la configuration réelle de l’équipement, sans conversion en force.", "Describe the actual equipment configuration without force conversion."),
  configuration_only_no_force_conversion: text("Décrire la configuration réelle, sans convertir la pression ou la résistance en force.", "Describe the actual setup without converting pressure or resistance into force."),
};
const reasonFor = x => {
  if (!["repetitions", "duration", "distance"].includes(x.performance.measure)) return "UNSUPPORTED_MEASURE";
  if (x.performance.load_components.length > 1) return "MULTIPLE_LOAD_COMPONENTS";
  if (x.performance.load_entry_basis === "to_confirm") return "AMBIGUOUS_LOAD_BASIS";
  if (x.performance.measure === "repetitions" && ["to_confirm", "not_applicable"].includes(x.performance.repetition_basis)) return "AMBIGUOUS_COUNTING";
  // The current duration result stores elapsed seconds, not a separate band
  // descriptor. Do not lose the source's required resistance configuration.
  if (x.performance.measure === "duration" && x.performance.load_entry_basis === "band_configuration") return "UNSUPPORTED_CONFIGURATION";
  if (!["per_implement", "total_external_mass", "displayed_stack_setting", "not_applicable", "band_configuration"].includes(x.performance.load_entry_basis)) return "UNSUPPORTED_CONFIGURATION";
  if (["per_implement", "total_external_mass", "displayed_stack_setting"].includes(x.performance.load_entry_basis) && x.performance.load_components.length !== 1) return "UNSUPPORTED_CONFIGURATION";
  if (["per_implement", "total_external_mass", "displayed_stack_setting"].includes(x.performance.load_entry_basis) && x.performance.load_components[0].unit !== "kg_or_lb") return "UNSUPPORTED_CONFIGURATION";
  if (x.name.fr.length > 160 || ["fr", "en"].some(lang => ["setup", "execution", "finish"].some(step => !x.client_instructions?.[lang]?.[step]?.trim()))) return "INCOMPLETE_INSTRUCTIONS";
  return null;
};

const exercises = source.exercises.filter(x => !legacyIds.has(x.id)).map(x => {
  if (!labels[x.equipment.id] || !fallbackLoad[x.performance.load_entry_basis]) throw new Error(`Unsupported source vocabulary: ${x.id}`);
  if (x.performance.accepted_by != null || x.performance.accepted_at != null) throw new Error("Human approval requires a separate reviewed import");
  const reason = reasonFor(x);
  const equipment = { id: x.equipment.id, labels: text(...labels[x.equipment.id]) };
  const muscles = Object.fromEntries(["primary", "secondary", "stabilizers"].map(role => [role, x.muscle_roles[role].map(id => {
    const c = concepts.get(id); if (!c) throw new Error("Unknown anatomy concept"); return { id, labels: c.labels };
  })]));
  const item = {
    id: x.id, sourceVersion: x.version, previousVersion: x.previous_version, name: x.name, equipment, muscles,
    instructions: x.client_instructions,
    performance: {
      measure: x.performance.measure,
      counting: text(x.performance.rep_definition_fr, x.performance.rep_definition_en),
      load: text(x.performance.load_notes_fr || fallbackLoad[x.performance.load_entry_basis].fr, x.performance.load_notes_en || fallbackLoad[x.performance.load_entry_basis].en),
      countingDecision: "PROPOSED", notes,
    },
    machines: x.machine_options.map(option => {
      const m = models.get(option.model_id); if (!m) throw new Error("Unknown machine reference");
      return {
        id: option.reference_link_id, modelId: m.id, modelVersion: String(m.reference_record_version ?? "unversioned"),
        manufacturer: m.manufacturer_name, name: `${m.model_code} · ${m.name_official}`,
        evidence: option.documentary_evidence_level === "exact_product" ? "exact_product" : "inferred_family",
        warning: text("Association documentaire non validée. Vérifier le modèle exact, ses appuis et sa configuration; la fiche générique n’atteste pas leur équivalence.", "Unapproved documentary association. Check the exact model, supports and setup; the generic exercise does not establish equivalence."), publishable: false,
      };
    }),
    status: "DRAFT", instructionReview: "PENDING", canPrescribe: false, media: null,
    selection: { canSelect: reason === null, reason },
  };
  return {
    item, loadEntryBasis: x.performance.load_entry_basis,
    searchTerms: [x.id, ...Object.values(x.name), ...Object.values(x.aliases).flat(), ...Object.values(equipment.labels), ...Object.values(x.movement_family.labels), x.movement_family.specific_family_fr, ...(x.domain === "mobility" ? ["mobilité", "mobility", "échauffement", "warmup"] : [])].filter(Boolean),
    equipmentIds: x.equipment.ids,
  };
});
const output = {
  catalogVersion: source.catalog_version,
  sourceSha256: createHash("sha256").update(bytes).digest("hex"),
  integrationVersion: "fe-catalogue.1", preservedPilotIds: [...legacyIds],
  equipmentOptions: Object.entries(labels).map(([id, [fr, en]]) => ({ id, labels: text(fr, en) })),
  anatomyConcepts: source.anatomy_concepts.map(({ id, labels, anatomical_aliases }) => ({ id, labels, anatomical_aliases })),
  searchGroups: source.search_groups.map(({ id, terms, target_concept_ids, coverage_sets }) => ({ id, terms, target_concept_ids, ...(coverage_sets ? { coverage_sets } : {}) })),
  searchExpansions: source.search_expansions.map(({ concept_id, include_ids }) => ({ concept_id, include_ids })),
  exercises,
};
const destination = fileURLToPath(new URL("../apps/portal/src/lib/training/pilot/catalogue-source.json", import.meta.url));
await writeFile(destination, JSON.stringify(output) + "\n");
// Extend the private JSON-shape validator only. The authenticated selection RPC,
// tenant/test-client gates, grants, RLS and all existing snapshots stay intact.
const originalMigration = await readFile(new URL("../apps/portal/supabase/migrations/202610230002_training_pilot_programs.sql", import.meta.url), "utf8");
const originalValidator = originalMigration.match(/create function app_private\.training_pilot_valid\(p jsonb\) returns boolean[\s\S]*?end \$\$;/)?.[0];
if (!originalValidator) throw new Error("Original pilot validator was not found");
let validator = originalValidator.replace("create function", () => "create or replace function")
  .replace("'^(DB|BB|CA|MA|BW|KB|BA)_[0-9]{3}$'", () => "'^(DB|BB|CA|MA|BW|KB|BA|LM|MB|SB|SL|SU|PL|BR|ER|CO|MO|MOBX|ATH)_[0-9]{3}$'")
  .replace("p->'sourceCatalogVersion' is distinct from '\"3.1.0-pilot.1\"'::jsonb", () => "not coalesce(p->>'sourceCatalogVersion' in ('3.1.0-pilot.1','4.0.0-unified.1'),false)")
  .replace("('dumbbell','barbell','cable','machine','bodyweight','kettlebell','band')", () => `(${Object.keys(labels).map(id => `'${id}'`).join(",")})`);
if (!validator.includes("MOBX") || !validator.includes("4.0.0-unified.1") || !validator.includes("support_surface")) throw new Error("Validator adaptation failed");
const seed = exercises.filter(x => x.item.selection.canSelect).map(({ item, loadEntryBasis }) => {
  const pilot = {
    sourceId: item.id, sourceVersion: item.sourceVersion, sourceCatalogVersion: source.catalog_version,
    integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST", name: item.name, equipment: item.equipment,
    instructions: item.instructions, performance: { ...item.performance, loadEntryBasis },
  };
  const default_unit = item.performance.measure === "duration" ? "sec" : item.performance.measure === "distance" ? "distance" : loadEntryBasis === "band_configuration" ? "configuration" : "lb";
  return { source_id: item.id, pilot, default_unit };
});
const seedJson = JSON.stringify(seed);
if (seedJson.includes("$catalogue_seed$")) throw new Error("Source contains a reserved SQL delimiter");
const migration = `-- Catalogue 4.0.0-unified.1: additive, staging-test-only descriptions.\n-- Generated by scripts/m1-import-exercise-catalogue.mjs; source SHA256 ${output.sourceSha256}.\n-- Existing 15 identities/snapshots, Auth, RPC permissions and RLS are unchanged.\nbegin;\n\n${validator}\n\ninsert into app_private.training_pilot_catalog(source_id,pilot,default_unit)\nselect x.source_id,x.pilot,x.default_unit\nfrom jsonb_to_recordset($catalogue_seed$${seedJson}$catalogue_seed$::jsonb)\nas x(source_id text,pilot jsonb,default_unit text);\n\ncommit;\n`;
await writeFile(new URL("../apps/portal/supabase/migrations/202610250002_training_catalogue.sql", import.meta.url), migration);
const reasons = {};
for (const row of exercises) reasons[row.item.selection.reason || "SELECTABLE"] = (reasons[row.item.selection.reason || "SELECTABLE"] || 0) + 1;
console.log(JSON.stringify({ sourceVersion: source.catalog_version, catalogSize: exercises.length + legacyIds.size, preservedPilotCount: legacyIds.size, newSourceSelection: reasons, outputBytes: Buffer.byteLength(JSON.stringify(output)) }));
