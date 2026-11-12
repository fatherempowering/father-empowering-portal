// Additive coverage projection. Default: preview only. --write emits local files.
// Keeps old revisions, client programs, approval status and media intact; never contacts live data.
// Usage: node scripts/m1-import-exercise-coverage.mjs /absolute/CATALOGUE_REFERENCE.json [--write]
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";


const sourcePath = process.argv[2];
if (!sourcePath?.startsWith("/")) throw new Error("An absolute catalogue source path is required");
const bytes = await readFile(sourcePath);
const source = JSON.parse(bytes);
if (source.catalog_version !== "4.1.0-coverage.1" || source.exercises.length !== 1326 || source.media_assets.length !== 0 || new Set(source.exercises.map(x => x.id)).size !== 1326) throw new Error("Unexpected catalogue revision");
const baseline = JSON.parse(await readFile(new URL("../apps/portal/src/lib/training/pilot/catalogue-source.json", import.meta.url), "utf8"));
const existingIds = new Set([...baseline.preservedPilotIds, ...baseline.exercises.map(x => x.item.id)]);
if (existingIds.size !== 1186 || [...existingIds].some(id => !source.exercises.some(x => x.id === id))) throw new Error("Existing catalogue identity missing");
const legacyIds = new Set(["DB_001", "DB_025", "DB_034", "DB_045", "BB_001", "BB_012", "CA_001", "CA_050", "MA_018", "MA_028", "MA_063", "BW_021", "BW_049", "KB_015", "BA_027"]);
const pilots = JSON.parse(await readFile(new URL("../apps/portal/src/lib/training/pilot/source.json", import.meta.url), "utf8"));
const integrated = new Map(baseline.exercises.map(x => [x.item.id, x.item]));
for (const x of pilots.exercises) {
  const instructions = structuredClone(x.client_instructions);
  if (x.id === "DB_034") {
    instructions.fr.finish = "Réalisez le même mouvement avec le bras gauche. Comptez les répétitions pour chaque bras séparément, sans regrouper droite et gauche en une répétition.";
    instructions.en.finish = "Repeat the movement with your left arm. Count repetitions for each arm separately; do not combine right and left into one repetition.";
  }
  integrated.set(x.id, { sourceVersion: x.version, instructions });
}
// Do not silently reinterpret a stable existing version if a later source reuses its number.
for (const x of source.exercises) {
  const row = baseline.exercises.find(y => y.item.id === x.id);
  if (!row || row.item.sourceVersion !== x.version) continue;
  const same = JSON.stringify(row.item.name) === JSON.stringify(x.name) &&
    JSON.stringify(row.item.instructions) === JSON.stringify(x.client_instructions) &&
    row.item.performance.measure === x.performance.measure && row.loadEntryBasis === x.performance.load_entry_basis &&
    row.item.performance.counting.fr === x.performance.rep_definition_fr && row.item.performance.counting.en === x.performance.rep_definition_en;
  if (!same) throw new Error(`UNVERSIONED_CONTENT_CHANGE:${x.id}`);
}
const labels = {
  dumbbell: ["Haltères", "Dumbbells"], barbell: ["Barres", "Barbells"], cable: ["Câbles", "Cables"], machine: ["Machines", "Machines"],
  bodyweight: ["Poids du corps", "Bodyweight"], kettlebell: ["Kettlebells", "Kettlebells"], band: ["Élastiques", "Resistance bands"],
  medicine_ball: ["Médecine-balls", "Medicine balls"], sandbag: ["Sacs lestés", "Sandbags"], sled: ["Traîneaux", "Sleds"],
  suspension: ["Suspension et anneaux", "Suspension and rings"], plyometric: ["Pliométrie et agilité", "Plyometrics and agility"],
  battle_rope: ["Cordes ondulatoires", "Battle ropes"], ergometer: ["Ergomètres et cardio", "Ergometers and cardio"],
  conditioning: ["Conditionnement", "Conditioning"], chair: ["Chaise", "Chair"], foam_roller: ["Rouleau de massage", "Foam roller"],
  massage_ball: ["Balle de massage", "Massage ball"], yoga_mat: ["Tapis", "Mat"], support_surface: ["Surface d’appui", "Support surface"], wall: ["Mur", "Wall"], other: ["Autre équipement", "Other equipment"],
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
// Retain unsupported source vocabulary as read-only; never invent a mass conversion.
for (const basis of ["total_system_mass", "total_including_bar", "band_identity_and_configuration", "added_plates_at_free_end", "per_stack", "suspended_added_mass"]) {
  fallbackLoad[basis] = text("Convention documentaire non prise en charge par la saisie actuelle; aucune charge n’est déduite.", "This documentary load convention is not supported by the current form; no load is inferred.");
}
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

const exercises = source.exercises.filter(x => !existingIds.has(x.id) || integrated.get(x.id)?.sourceVersion !== x.version).map(x => {
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
  if (x.id === "DB_034") {
    // Preserve Max's explicit per-arm decision over the supplier's alternating-pair convention.
    item.instructions = structuredClone(item.instructions);
    item.instructions.fr.finish = integrated.get(x.id).instructions.fr.finish;
    item.instructions.en.finish = integrated.get(x.id).instructions.en.finish;
    item.performance.counting = text("Répétitions par bras", "Repetitions per arm");
    item.performance.load = text("Masse d’un seul haltère, jamais la somme des deux.", "Mass of one dumbbell, never the sum of both.");
    item.performance.countingDecision = "MAX_PER_ARM_2026_10_23";
    item.performance.notes = text("Comptage par bras retenu par Max. Aucun total n’est divisé par deux. Les consignes techniques restent à vérifier.", "Per-arm counting selected by Max. No total is divided by two. Technical instructions still need review.");
  }
  return {
    replacesSourceVersion: integrated.get(x.id)?.sourceVersion ?? null,
    item, loadEntryBasis: x.performance.load_entry_basis,
    searchTerms: [x.id, ...Object.values(x.name), ...Object.values(x.aliases).flat(), ...Object.values(equipment.labels), ...Object.values(x.movement_family.labels), x.movement_family.specific_family_fr, ...(x.domain === "mobility" ? ["mobilité", "mobility", "échauffement", "warmup"] : [])].filter(Boolean),
    equipmentIds: x.equipment.ids,
  };
});
const output = {
  catalogVersion: source.catalog_version,
  sourceSha256: createHash("sha256").update(bytes).digest("hex"),
  integrationVersion: "fe-coverage.1", baseCatalogVersion: baseline.catalogVersion,
  equipmentOptions: Object.entries(labels).map(([id, [fr, en]]) => ({ id, labels: text(fr, en) })),
  anatomyConcepts: source.anatomy_concepts.map(({ id, labels, anatomical_aliases }) => ({ id, labels, anatomical_aliases })),
  searchGroups: source.search_groups.map(({ id, terms, target_concept_ids, coverage_sets }) => ({ id, terms, target_concept_ids, ...(coverage_sets ? { coverage_sets } : {}) })),
  searchExpansions: source.search_expansions.map(({ concept_id, include_ids }) => ({ concept_id, include_ids })),
  exercises,
};

if (exercises.length !== 195) throw new Error("Unexpected coverage delta size");
const revisions = source.exercises.filter(x => existingIds.has(x.id)).flatMap(x => {
  const before = integrated.get(x.id);
  return before && (before.sourceVersion !== x.version || JSON.stringify(before.instructions) !== JSON.stringify(x.client_instructions))
    ? [{ id: x.id, integratedVersion: before.sourceVersion, incomingVersion: x.version, instructionsChanged: JSON.stringify(before.instructions) !== JSON.stringify(x.client_instructions), action: "NEW_VERSION_ADDED_OLD_VERSION_RETAINED" }] : [];
});
const oldMigration = await readFile(new URL("../apps/portal/supabase/migrations/202610250002_training_catalogue.sql", import.meta.url), "utf8");
let validator = oldMigration.match(/create or replace function app_private\.training_pilot_valid\(p jsonb\) returns boolean[\s\S]*?end \$\$;/)?.[0];
if (!validator) throw new Error("Existing validator not found");
validator = validator.replace("|ATH)", "|ATH|COVL|COVU|COVF)").replace("'4.0.0-unified.1'", "'4.0.0-unified.1','4.1.0-coverage.1'").replace("'wall')", "'wall','other')");
if (!validator.includes("COVL") || !validator.includes("4.1.0-coverage.1") || !validator.includes("'other'")) throw new Error("Coverage validator adaptation failed");
const seed = exercises.filter(x => x.item.selection.canSelect).map(({ item, loadEntryBasis }) => ({
  source_id: item.id,
  pilot: { sourceId: item.id, sourceVersion: item.sourceVersion, sourceCatalogVersion: source.catalog_version,
    integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST", name: item.name, equipment: item.equipment,
    instructions: item.instructions, performance: { ...item.performance, loadEntryBasis } },
  default_unit: item.performance.measure === "duration" ? "sec" : item.performance.measure === "distance" ? "distance" : loadEntryBasis === "band_configuration" ? "configuration" : "lb",
}));
const seedJson = JSON.stringify(seed);
if (seedJson.includes("$coverage_seed$")) throw new Error("Reserved SQL delimiter");
const migration = `-- Additive coverage 4.1.0; no existing identity, publication or approval is changed.
-- Generated from SHA256 ${output.sourceSha256}. Run only in reviewed staging migration flow.
begin;
${validator}
-- Serialize concurrent/repeated application; reject same-ID content conflicts instead of overwriting.
lock table app_private.training_pilot_catalog in access exclusive mode;
-- Source IDs remain stable; immutable old revisions remain selectable by their exact version.
alter table app_private.training_pilot_catalog add column if not exists source_version text
 generated always as (pilot->>'sourceVersion') stored;
alter table app_private.training_pilot_catalog drop constraint training_pilot_catalog_pkey;
alter table app_private.training_pilot_catalog add primary key(source_id,source_version);
create temporary table coverage_seed on commit drop as
select * from jsonb_to_recordset($coverage_seed$${seedJson}$coverage_seed$::jsonb)
as x(source_id text,pilot jsonb,default_unit text);
do $coverage_check$ begin
 if exists(select 1 from coverage_seed s join app_private.training_pilot_catalog c on c.source_id=s.source_id and c.source_version=s.pilot->>'sourceVersion'
   where c.pilot is distinct from s.pilot or c.default_unit is distinct from s.default_unit) then
   raise exception 'FE_COVERAGE_IDENTITY_CONFLICT';
 end if;
end $coverage_check$;
insert into app_private.training_pilot_catalog(source_id,pilot,default_unit)
select source_id,pilot,default_unit from coverage_seed on conflict(source_id,source_version) do nothing;
commit;
`;
const reasons = {};
for (const row of exercises) reasons[row.item.selection.reason || "SELECTABLE"] = (reasons[row.item.selection.reason || "SELECTABLE"] || 0) + 1;
const report = { sourceVersion: source.catalog_version, sourceSha256: output.sourceSha256, preservedIdentities: existingIds.size,
  additiveIdentities: exercises.filter(x => x.replacesSourceVersion === null).length, revisedIdentities: revisions, reasons, preservedOverlayIds: ["DB_034"], currentVersions: Object.fromEntries(source.exercises.map(x => [x.id, x.version])), mediaPublished: false, approvalsGranted: false };
if (process.argv.includes("--write")) {
  await writeFile(new URL("../apps/portal/src/lib/training/pilot/catalogue-coverage-source.json", import.meta.url), JSON.stringify(output)+"\n");
  await writeFile(new URL("../apps/portal/supabase/migrations/202611120001_training_catalogue_coverage.sql", import.meta.url), migration);
  await writeFile(new URL("../docs/quality/CATALOGUE-COVERAGE-IMPORT.json", import.meta.url), JSON.stringify(report,null,2)+"\n");
}
console.log(JSON.stringify({ ...report, revisedIdentities: revisions.length, currentVersions: Object.keys(report.currentVersions).length, mode: process.argv.includes("--write") ? "LOCAL_FILES_ONLY" : "PREVIEW" }));
