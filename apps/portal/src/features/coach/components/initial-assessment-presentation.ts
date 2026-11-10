import type {
  InitialAssessmentResponses,
  PainAnswer,
  Weekday,
} from "@/lib/contracts/week-zero";
import { translateUi } from "@/components/fe/ui-copy";

const weekdayLabels: Record<Weekday, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

export function displayValue(
  value: string | number | null,
  unit = "",
  language: "fr" | "en" = "fr",
): string {
  if (value === null || value === "") return translateUi("Non renseigné", language);
  return `${value}${language === "en" && unit === " po" ? " in" : unit}`;
}

export function displayPain(value: PainAnswer, language: "fr" | "en" = "fr"): string {
  return translateUi(value === "YES" ? "Oui" : value === "NO" ? "Non" : "Non évalué", language);
}

export function displayWeekdays(days: Weekday[], language: "fr" | "en" = "fr"): string {
  if (days.length === 0) return translateUi("Non renseigné", language);
  return days.map((day) => translateUi(weekdayLabels[day], language)).join(", ");
}

export function formatAssessmentDate(
  value: string | null,
  timezone: string,
  language: "fr" | "en" = "fr",
): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  try {
    return new Intl.DateTimeFormat(`${language}-CA`, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(`${language}-CA`, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}

export type AssessmentSection = Readonly<{
  id: "measurements" | "mobility" | "availability";
  title: string;
  items: ReadonlyArray<Readonly<{ label: string; value: string }>>;
}>;

export function assessmentSections(
  responses: InitialAssessmentResponses,
  language: "fr" | "en" = "fr",
): AssessmentSection[] {
  const value = (entry: string | number | null, unit = "") => displayValue(entry, unit, language);
  const pain = (entry: PainAnswer) => displayPain(entry, language);
  return [
    {
      id: "measurements",
      title: "Mesures",
      items: [
        {
          label: "Poids corporel",
          value: value(responses.measurements.bodyWeightLb, " lb"),
        },
        {
          label: "Tour de taille au nombril",
          value: value(responses.measurements.waistIn, " po"),
        },
        {
          label: "Poitrine",
          value: value(responses.measurements.chestIn, " po"),
        },
        {
          label: "Hanches",
          value: value(responses.measurements.hipsIn, " po"),
        },
        {
          label: "Bras droit fléchi",
          value: value(responses.measurements.rightArmIn, " po"),
        },
        {
          label: "Cuisse droite",
          value: value(responses.measurements.rightThighIn, " po"),
        },
        {
          label: "Autres mesures ou précisions",
          value: value(responses.measurements.other),
        },
      ],
    },
    {
      id: "mobility",
      title: "Mobilité et douleur",
      items: [
        {
          label: "Douleur — squat ou jambes",
          value: pain(responses.mobility.painSquat),
        },
        {
          label: "Douleur — charnière, RDL ou soulevé de terre",
          value: pain(responses.mobility.painHinge),
        },
        {
          label: "Douleur — poussée ou développé",
          value: pain(responses.mobility.painPush),
        },
        {
          label: "Douleur — tirage",
          value: pain(responses.mobility.painPull),
        },
        {
          label: "Douleur — cardio",
          value: pain(responses.mobility.painCardio),
        },
        {
          label: "Mouvement le plus limité",
          value: value(responses.mobility.limitedMovement),
        },
        {
          label: "Mouvement le plus confortable",
          value: value(responses.mobility.comfortableMovement),
        },
        {
          label: "Zone tendue ou raide",
          value: value(responses.mobility.tightArea),
        },
      ],
    },
    {
      id: "availability",
      title: "Disponibilités",
      items: [
        {
          label: "Jours disponibles",
          value: displayWeekdays(responses.availability.days, language),
        },
        {
          label: "Meilleur moment",
          value: value(responses.availability.bestTime),
        },
        {
          label: "Durée possible par séance",
          value: value(
            responses.availability.sessionDurationMinutes,
            " min",
          ),
        },
        {
          label: "Séances possibles par semaine",
          value: value(responses.availability.sessionsPerWeek),
        },
        {
          label: "Contraintes ou précisions",
          value: value(responses.availability.constraints),
        },
      ],
    },
  ];
}
