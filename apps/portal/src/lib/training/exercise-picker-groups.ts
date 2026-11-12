import { normalizeExerciseSearch } from "./pilot/search-aliases";

export const EXERCISE_MUSCLE_GROUP_IDS = ["all", "chest", "back", "legs", "shoulders", "arms", "core"] as const;
export type ExerciseMuscleGroup = typeof EXERCISE_MUSCLE_GROUP_IDS[number];
export const EXERCISE_MUSCLE_GROUPS = [
  { id: "all", label: { fr: "Tous", en: "All" } },
  { id: "chest", label: { fr: "Pectoraux", en: "Chest" } },
  { id: "back", label: { fr: "Dos", en: "Back" } },
  { id: "legs", label: { fr: "Jambes", en: "Legs" } },
  { id: "shoulders", label: { fr: "Épaules", en: "Shoulders" } },
  { id: "arms", label: { fr: "Bras", en: "Arms" } },
  { id: "core", label: { fr: "Abdominaux", en: "Core" } },
] as const;
const concepts: Record<Exclude<ExerciseMuscleGroup, "all">, readonly string[]> = {
  chest: ["M_PECTORALIS_MAJOR", "M_PECTORALIS_MINOR", "MG_PECTORALS", "MP_PECTORALIS_MAJOR_CLAVICULAR"],
  back: ["M_LATISSIMUS_DORSI", "MG_RHOMBOIDS", "M_TRAPEZIUS", "MP_TRAPEZIUS_MIDDLE", "MP_TRAPEZIUS_INFERIOR", "MP_TRAPEZIUS_SUPERIOR", "MG_ERECTOR_SPINAE", "M_TERES_MAJOR", "FG_SCAPULAR_MUSCLES", "FG_SPINAL_MUSCLES", "FG_THORACIC_MUSCLES", "M_LEVATOR_SCAPULAE"],
  legs: ["MG_QUADRICEPS", "MG_HAMSTRINGS", "M_GLUTEUS_MAXIMUS", "M_GLUTEUS_MEDIUS", "M_GLUTEUS_MINIMUS", "MG_GLUTEALS", "MG_HIP_ADDUCTORS", "MG_CALF", "MG_TRICEPS_SURAE", "M_GASTROCNEMIUS", "M_SOLEUS", "M_RECTUS_FEMORIS", "M_TIBIALIS_ANTERIOR", "FG_HIP_FLEXORS", "FG_HIP_ABDUCTORS", "FG_HIP_EXTENSORS", "MG_ILIOPSOAS", "M_PSOAS_MAJOR", "M_PIRIFORMIS", "M_TENSOR_FASCIAE_LATAE", "FG_HIP_MUSCLES", "FG_HIP_ROTATORS", "FG_HIP_EXTERNAL_ROTATORS", "FG_HIP_INTERNAL_ROTATORS", "M_TIBIALIS_POSTERIOR", "MG_FIBULARIS", "FG_TOE_FLEXORS", "FG_TOE_EXTENSORS", "MG_INTRINSIC_FOOT", "FG_HALLUX_FLEXORS", "FG_HALLUX_EXTENSORS", "M_EXTENSOR_HALLUCIS_LONGUS", "M_EXTENSOR_DIGITORUM_LONGUS_FOOT", "M_ADDUCTOR_MAGNUS", "M_SARTORIUS", "M_FIBULARIS_LONGUS", "M_FIBULARIS_BREVIS", "M_FIBULARIS_TERTIUS", "MP_GLUTEUS_MEDIUS_ANTERIOR_FIBERS"],
  shoulders: ["M_DELTOID", "MP_DELTOID_ANTERIOR", "MP_DELTOID_POSTERIOR", "MP_DELTOID_MIDDLE", "MG_ROTATOR_CUFF", "M_SUPRASPINATUS", "M_INFRASPINATUS", "M_TERES_MINOR", "M_SUBSCAPULARIS", "M_SERRATUS_ANTERIOR"],
  arms: ["M_BICEPS_BRACHII", "M_BRACHIALIS", "M_BRACHIORADIALIS", "M_TRICEPS_BRACHII", "MP_TRICEPS_BRACHII_LONG", "REG_FOREARM", "FG_WRIST_FLEXORS", "FG_WRIST_EXTENSORS", "FG_GRIP", "FG_ELBOW_FLEXORS", "FG_FOREARM_PRONATORS", "FG_FOREARM_SUPINATORS", "FG_FINGER_FLEXORS", "FG_FINGER_EXTENSORS", "M_ANCONEUS", "M_SUPINATOR", "M_PRONATOR_TERES", "M_PRONATOR_QUADRATUS", "M_FLEXOR_DIGITORUM_PROFUNDUS", "M_FLEXOR_DIGITORUM_SUPERFICIALIS", "M_EXTENSOR_DIGITORUM", "M_EXTENSOR_INDICIS", "MG_HAND_LUMBRICALS", "MG_PALMAR_INTEROSSEI", "MG_DORSAL_INTEROSSEI", "M_ABDUCTOR_DIGITI_MINIMI_HAND", "M_FLEXOR_POLLICIS_LONGUS", "M_FLEXOR_POLLICIS_BREVIS", "M_EXTENSOR_POLLICIS_LONGUS", "M_EXTENSOR_POLLICIS_BREVIS", "M_ABDUCTOR_POLLICIS_LONGUS", "M_ABDUCTOR_POLLICIS_BREVIS", "M_OPPONENS_POLLICIS", "M_ADDUCTOR_POLLICIS", "M_FLEXOR_CARPI_RADIALIS", "M_FLEXOR_CARPI_ULNARIS", "M_EXTENSOR_CARPI_RADIALIS_LONGUS", "M_EXTENSOR_CARPI_RADIALIS_BREVIS", "M_EXTENSOR_CARPI_ULNARIS", "MG_INTRINSIC_HAND"],
  core: ["MG_ABDOMINALS", "MG_ABDOMINAL_OBLIQUES", "M_TRANSVERSUS_ABDOMINIS", "M_RECTUS_ABDOMINIS", "FG_TRUNK", "M_QUADRATUS_LUMBORUM", "MG_MULTIFIDUS", "MG_INTERCOSTALS", "MG_INTERCOSTALS_EXTERNAL", "M_DIAPHRAGM", "FG_LUMBAR_MUSCLES"],
};
export function matchesExerciseMuscleGroup(muscles: { primary: { id: string }[]; secondary: { id: string }[] }, group: ExerciseMuscleGroup = "all") {
  return group === "all" || [...muscles.primary, ...muscles.secondary].some(muscle => concepts[group].includes(muscle.id));
}
// Personal library rows have no anatomy metadata yet. Use conservative bilingual
// movement-name families rather than pretending they have verified muscle tags.
export function matchesLibraryMuscleGroup(name: string, group: ExerciseMuscleGroup = "all") {
  if (group === "all") return true;
  const value = normalizeExerciseSearch(name);
  const families: Record<Exclude<ExerciseMuscleGroup, "all">, RegExp> = {
    chest: /\b(chest|pectoral|pectoraux|poitrine|bench|couche|pompe|push up|pushup|fly|ecarte)\b/,
    back: /\b(back|dos|row|rowing|tirage|traction|pull up|pullup|pulldown|deadlift|souleve de terre)\b/,
    legs: /\b(leg|jambes?|squat|lunge|fente|deadlift|souleve de terre|glute|fessier|hip thrust|calf|mollet|hamstring|ischio|quadriceps|hanche|hip|cheville|ankle|pied|foot|toe|orteil)\b/,
    shoulders: /\b(shoulder|epaule|deltoid|deltoide|overhead|military|militaire|lateral raise|elevation laterale|oiseau|arnold|rotator|rotation externe)\b/,
    arms: /\b(biceps?|triceps?|curl|avant bras|forearm|pushdown|skull crusher|wrist|poignet|doigt|finger|pouce|thumb|grip)\b/,
    core: /\b(abdos?|abs|abdomin|abdominal|abdominaux|plank|planche|crunch|pallof|sit up|gainage|oblique)\b/,
  };
  if (group === "chest" && /\b(row|rowing|tirage)\b/.test(value)) return false;
  return families[group].test(value);
}
