// Small product vocabulary, safe to ship with the picker. No catalogue payload.
export function normalizeExerciseSearch(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function canonicalExerciseSearch(value: string) {
  return normalizeExerciseSearch(value).replace(/\bupperbody\b/g, "upper body")
    .replace(/\bpushups?\b/g, "push up").replace(/\bpush ups\b/g, "push up")
    .replace(/\bpompes\b/g, "pompe").replace(/\bpalloff\b/g, "pallof")
    .replace(/\babdo\b/g, "abdos");
}

export const UPPER_BODY_MUSCLES = ["M_PECTORALIS_MAJOR", "M_TRICEPS_BRACHII", "M_BICEPS_BRACHII", "M_BRACHIALIS", "M_BRACHIORADIALIS", "M_LATISSIMUS_DORSI", "MG_RHOMBOIDS", "MP_TRAPEZIUS_MIDDLE", "MP_TRAPEZIUS_INFERIOR", "M_TRAPEZIUS", "M_DELTOID", "MP_DELTOID_ANTERIOR", "MP_DELTOID_POSTERIOR", "MG_ROTATOR_CUFF", "M_TERES_MAJOR", "M_SERRATUS_ANTERIOR"] as const;
export function isUpperBodySearch(value: string) { return ["upper body", "haut du corps", "haut corps"].includes(canonicalExerciseSearch(value)); }

const groups = [
  { aliases: ["chest", "poitrine", "pecs", "pec", "pectoraux", "pectorals"], terms: ["chest", "poitrine", "bench press", "pompe", "push-up", "pushup", "pectoral"], family: "chest" },
  { aliases: ["push up", "pompe", "pompe au sol"], terms: ["push-up", "pushup", "push up", "pompe"], family: "pushup" },
  { aliases: ["upper body", "haut du corps", "haut corps"], terms: ["press", "développé", "row", "tirage", "traction", "pull-up", "pompe", "curl"], family: "upper" },
  { aliases: ["dos", "back"], terms: ["row", "tirage", "traction", "pull-up", "deadlift", "soulevé de terre"], family: "back" },
  { aliases: ["abdos", "abs", "abdominaux", "abdominal", "abdominals"], terms: ["pallof", "planche", "plank", "crunch", "abdominal"], family: "abs" },
  { aliases: ["jambes", "legs", "lower body", "bas du corps"], terms: ["squat", "leg", "fente", "lunge", "deadlift", "soulevé de terre", "hip thrust"], family: "legs" },
  { aliases: ["ischio fessiers", "ischiofessiers", "hamstrings and glutes"], terms: ["deadlift", "soulevé de terre", "squat", "swing", "hip thrust", "leg curl"], family: "posterior" },
  { aliases: ["ischios", "ischio jambiers", "ischiojambiers", "hamstrings"], terms: ["leg curl", "deadlift", "soulevé de terre", "ischio"], family: "hamstrings" },
  { aliases: ["fessiers", "glutes", "glute"], terms: ["hip thrust", "glute", "fessier", "squat", "lunge", "fente"], family: "glutes" },
] as const;

const equipmentPhrases = [
  ["cable", /\b(?:a la poulie|a poulie|au cable|avec cable|poulies?|cables?)\b/g],
  ["band", /\b(?:avec bande|avec elastique|bandes?|elastiques?|resistance band)\b/g],
  ["dumbbell", /\b(?:avec halteres|aux halteres|halteres?|dumbbells?)\b/g],
  ["barbell", /\b(?:avec barre|a la barre|barbell)\b/g],
  ["bodyweight", /\b(?:au poids du corps|poids du corps|bodyweight)\b/g],
  ["kettlebell", /\bkettlebells?\b/g],
  ["machine", /\b(?:a la machine|machine)\b/g],
] as const;

export function splitExerciseSearch(value: string) {
  let query = canonicalExerciseSearch(value);
  let equipment: "" | typeof equipmentPhrases[number][0] = "";
  for (const [id, expression] of equipmentPhrases) {
    expression.lastIndex = 0;
    if (expression.test(query)) {
      expression.lastIndex = 0;
      query = query.replace(expression, " ").trim().replace(/\s+/g, " "); equipment = id; break;
    }
  }
  return { query, equipment };
}

export function librarySearchTerms(value: string) {
  const { query } = splitExerciseSearch(value);
  const group = groups.find(item => item.aliases.some(alias => alias === query));
  return group ? [...group.terms] : [...new Set([query, ...(query && !splitExerciseSearch(value).equipment ? [value.trim()] : [])])];
}

export function matchesLibrarySearch(name: string, value: string) {
  const query = splitExerciseSearch(value).query;
  const group = groups.find(item => item.aliases.some(alias => alias === query));
  const normalized = canonicalExerciseSearch(name);
  // A chest-supported row is a row, not a chest exercise. A leg/antirotation
  // press is not an upper-body press merely because its name contains press.
  if (group?.family === "chest" && /\b(row|rowing|tirage)\b/.test(normalized)) return false;
  if (group?.family === "upper" && /\b(leg|jambes|cuisses|pallof|antirotation|anti rotation)\b/.test(normalized)) return false;
  return !group || group.terms.some(term => normalized.includes(canonicalExerciseSearch(term)));
}

export function matchesLibraryEquipment(value: string, equipment: string) {
  if (!equipment) return true;
  const terms: Record<string, string[]> = {
    cable: ["cable", "poulie"], band: ["band", "bande", "elastique"], dumbbell: ["dumbbell", "haltere"],
    barbell: ["barbell", "barre"], bodyweight: ["bodyweight", "poids du corps"], kettlebell: ["kettlebell"], machine: ["machine"],
  };
  const normalized = normalizeExerciseSearch(value);
  return (terms[equipment] ?? []).some(term => normalized.includes(term));
}
