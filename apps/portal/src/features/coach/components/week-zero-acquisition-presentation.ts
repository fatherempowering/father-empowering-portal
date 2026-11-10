import { translateUi } from "@/components/fe/ui-copy";
import { WEEK_ZERO_MOVEMENT_KEYS, type CoachWeekZeroAcquisition, type WeekZeroLoadEntry, type WeekZeroMovementKey } from "@/lib/contracts/week-zero-acquisition";

export const movementLabels: Record<WeekZeroMovementKey, string> = {
  squat: "Squat", deadlift: "Deadlift", horizontalPress: "Press horizontal", verticalPress: "Press vertical",
  cableRow: "Cable row", pullUps: "Pull-ups", lunge: "Lunges", legPress: "Leg press",
};
const variants: Record<string, string> = {
  SQUAT: "Squat", BARBELL_SQUAT: "Squat avec barre", DUMBBELL_SQUAT: "Squat avec haltères",
  DEADLIFT: "Deadlift", BARBELL_DEADLIFT: "Deadlift avec barre", DUMBBELL_DEADLIFT: "Deadlift avec haltères",
  BENCH_PRESS: "Bench press avec barre", DUMBBELL_PRESS: "Dumbbell press",
  OVERHEAD_PRESS: "Overhead press", SHOULDER_PRESS: "Shoulder press",
  BARBELL_OVERHEAD_PRESS: "Overhead press avec barre", DUMBBELL_SHOULDER_PRESS: "Shoulder press avec haltères",
  CABLE_ROW: "Cable row", PULL_UPS: "Pull-ups", LUNGE: "Lunges", LEG_PRESS: "Leg press",
  BODYWEIGHT_LUNGE: "Lunges au poids du corps", BARBELL_LUNGE: "Lunges avec barre", DUMBBELL_LUNGE: "Lunges avec haltères",
};
const modes = { TOTAL: "au total", PER_HAND: "par haltère", BODYWEIGHT: "Poids du corps", ASSISTED: "d’assistance", ADDED: "ajoutés" };
type Item = { label: string; value: string };
export type AcquisitionSection = { id: string; title: string; items: Item[] };
const displayValue = (item: string | number | null, unit: string, language: "fr" | "en") => item === null || item === "" ? translateUi("Non renseigné", language) : `${item}${language === "en" ? unit.replace(" po", " in").replace(" ans", " years") : unit}`;

export function calibrationItems(entry: WeekZeroLoadEntry, movement: WeekZeroMovementKey, language: "fr" | "en" = "fr"): Item[] {
  const value = (item: string | number | null, unit = "") => displayValue(item, unit, language);
  const t = (text: string) => translateUi(text, language);
  if (entry.status === "NOT_PERFORMED") return [{ label: "État", value: t("Non réalisé — à revoir avec le Coach") }, { label: "Raison", value: value(entry.reason) }, { label: "Note", value: value(entry.note) }];
  if (entry.status === "NOT_STARTED") return [{ label: "État", value: t("Non renseigné") }];
  return [
    { label: "Exercice réalisé", value: entry.variant ? t(variants[entry.variant] ?? entry.variant) : t("Non renseigné") },
    { label: "Charge", value: entry.mode === "BODYWEIGHT" ? t(modes.BODYWEIGHT) : entry.load === null || !entry.unit || !entry.mode ? t("Non renseignée") : `${entry.load} ${entry.unit.toLowerCase()} ${t(modes[entry.mode])}` },
    { label: movement === "lunge" ? "Répétitions par côté" : "Répétitions", value: value(entry.reps) },
    { label: "Répétitions estimées en réserve", value: entry.rir === null ? t("Le client ne sait pas") : String(entry.rir) },
    { label: "Note / douleur", value: value(entry.note) },
  ];
}

export function formatSeconds(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
}

export function acquisitionSections(snapshot: CoachWeekZeroAcquisition, language: "fr" | "en" = "fr"): AcquisitionSection[] {
  const value = (item: string | number | null, unit = "") => displayValue(item, unit, language);
  const t = (text: string) => translateUi(text, language);
  const r = snapshot.responses;
  if (snapshot.status !== "SUBMITTED" || !r) return [];
  const sections: AcquisitionSection[] = [{ id: "measurements", title: "Mesures de départ", items: [
    { label: "Poids au réveil", value: value(r.measurements.bodyWeightLb, " lb") },
    { label: "Tour de taille au nombril", value: value(r.measurements.waistIn, " po") },
    { label: "Poitrine", value: value(r.measurements.chestIn, " po") },
    { label: "Hanches", value: value(r.measurements.hipsIn, " po") },
    { label: "Bras gauche fléchi", value: value(r.measurements.leftArmIn ?? null, " po") },
    { label: "Bras droit fléchi", value: value(r.measurements.rightArmIn, " po") },
    { label: "Cuisse droite", value: value(r.measurements.rightThighIn, " po") },
    { label: "Mollet gauche", value: value(r.measurements.leftCalfIn ?? null, " po") },
    { label: "Mollet droit", value: value(r.measurements.rightCalfIn ?? null, " po") },
    { label: "Précisions", value: value(r.measurements.other) },
  ] }];
  for (const movement of WEEK_ZERO_MOVEMENT_KEYS) sections.push({ id: movement, title: movementLabels[movement], items: calibrationItems(r.loads[movement], movement, language) });
  const cardio: Item[] = [];
  const selfLabels = { EXCELLENT: "Excellent", GOOD: "Bon", POOR: "Mauvais", NONE: "Nul" };
  cardio.push({ label: "Niveau cardio — autoévaluation (hors calcul)", value: r.cardio.selfAssessment ? t(selfLabels[r.cardio.selfAssessment]) : t("Non renseigné") });
  if (r.cardio.status === "NOT_PERFORMED") {
    cardio.push({ label: "État", value: t("Cardio non réalisé — à revoir avec le Coach") }, { label: "Raison", value: value(r.cardio.reason) });
  } else {
    cardio.push({ label: "Protocole", value: t("Concept2 Rower — 2 000 m") },
      { label: "Temps enregistré", value: r.cardio.totalSeconds === null ? t("Non renseigné") : formatSeconds(r.cardio.totalSeconds) },
      { label: "Poids utilisé pour le calcul", value: value(r.cardio.weightKg, " kg") },
      { label: "Âge au test", value: value(r.cardio.age, " ans") },
      { label: "Sexe utilisé par la formule", value: r.cardio.sex === "MALE" ? t("Masculin") : r.cardio.sex === "FEMALE" ? t("Féminin") : t("Non renseigné") },
      { label: "Expérience en aviron", value: r.cardio.trainingLevel === "HIGHLY_TRAINED" ? t("Très entraîné en aviron") : t("Pas très entraîné en aviron") });
    const result = snapshot.derived?.cardio;
    if (result) {
      cardio.push({ label: "Allure moyenne / 500 m", value: formatSeconds(result.paceSecondsPer500) },
        { label: "Puissance moyenne", value: `${result.averageWatts.toFixed(1)} W` },
        { label: "VO₂max estimé — pas une mesure de laboratoire", value: result.estimatedVo2MaxMlKgMin === null ? t("Estimation indisponible : ce résultat est hors des limites de la formule.") : `${result.estimatedVo2MaxMlKgMin.toFixed(1)} mL/kg/min` });
      const labels = { POOR: "Faible", FAIR: "À développer", AVERAGE: "Moyen", GOOD: "Bon", EXCELLENT: "Excellent", OUTSIDE_REFERENCE: "Hors des valeurs de référence", UNAVAILABLE_AGE_REFERENCE: "Référence d’âge indisponible" };
      cardio.push({ label: "Repère cardio Concept2", value: result.classification ? t(labels[result.classification]) : t("Non disponible") });
    } else cardio.push({ label: "Estimation", value: t("Indisponible : aucun résultat calculé reçu") });
  }
  cardio.push({ label: "Commentaire cardio", value: value(r.cardio.notes) });
  sections.push({ id: "cardio", title: "Cardio", items: cardio });
  const pain = { NO: "Non", YES: "Oui", NOT_PERFORMED: "Non testé", NOT_ASSESSED: t("Non renseigné") };
  sections.push({ id: "mobility", title: "Mobilité après les exercices", items: [
    { label: "Douleur squat / jambes", value: t(pain[r.mobility.painSquat]) },
    { label: "Douleur — flexion des hanches ou soulevé de terre", value: t(pain[r.mobility.painHinge]) },
    { label: "Douleur poussée", value: t(pain[r.mobility.painPush]) },
    { label: "Douleur tirage", value: t(pain[r.mobility.painPull]) },
    { label: "Douleur cardio", value: t(pain[r.mobility.painCardio]) },
    { label: "Mouvement le plus limité", value: value(r.mobility.limitedMovement) },
    { label: "Mouvement le plus confortable", value: value(r.mobility.comfortableMovement) },
    { label: "Zone raide ou tendue", value: value(r.mobility.tightArea) },
  ] });
  return sections.map(section => ({ ...section, title: t(section.title), items: section.items.map(item => ({ ...item, label: t(item.label) })) }));
}
