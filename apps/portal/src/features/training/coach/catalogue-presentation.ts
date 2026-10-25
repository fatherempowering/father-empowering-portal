import type { PilotExercise } from "@/lib/contracts/exercise-pilot";

export const CATALOGUE_EQUIPMENT_LABELS: Record<string, string> = {
  dumbbell: "Haltères", barbell: "Barre", cable: "Poulie", machine: "Machine",
  bodyweight: "Poids du corps", kettlebell: "Kettlebell", band: "Élastique",
  medicine_ball: "Médecine-ball", sandbag: "Sac lesté", sled: "Traîneau",
  suspension: "Sangles de suspension", plyometric: "Matériel pliométrique",
  battle_rope: "Cordes ondulatoires", ergometer: "Ergomètre",
  conditioning: "Conditionnement", chair: "Chaise", foam_roller: "Rouleau de massage",
  massage_ball: "Balle de massage", yoga_mat: "Tapis", support_surface: "Surface d’appui", wall: "Mur",
};

export function catalogueSelectionMessage(exercise: PilotExercise, language: "fr" | "en" = "fr") {
  if (!exercise.selection || exercise.selection.canSelect) return null;
  const messages = {
    MULTIPLE_LOAD_COMPONENTS: ["Lecture seulement : cette variante demande plusieurs charges distinctes, que la saisie actuelle ne peut pas conserver séparément.", "Read only: this variation needs multiple separate loads that the current form cannot preserve individually."],
    UNSUPPORTED_MEASURE: ["Lecture seulement : le mode de mesure de cette fiche n’est pas encore pris en charge.", "Read only: this exercise’s measurement method is not supported yet."],
    AMBIGUOUS_LOAD_BASIS: ["Lecture seulement : la manière de noter la charge doit être clarifiée avant de prescrire cet exercice.", "Read only: the load recording convention must be clarified before prescribing this exercise."],
    AMBIGUOUS_COUNTING: ["Lecture seulement : le comptage des répétitions doit être clarifié pour cette variante.", "Read only: repetition counting must be clarified for this variation."],
    UNSUPPORTED_CONFIGURATION: ["Lecture seulement : cette configuration demande des réglages que le formulaire actuel ne peut pas enregistrer.", "Read only: this setup needs settings that the current form cannot record."],
    INCOMPLETE_INSTRUCTIONS: ["Lecture seulement : les consignes de cette fiche restent à compléter.", "Read only: this exercise’s instructions still need to be completed."],
  } as const;
  return messages[exercise.selection.reason][language === "fr" ? 0 : 1];
}
