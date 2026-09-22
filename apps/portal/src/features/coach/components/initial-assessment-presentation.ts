import type {
  InitialAssessmentResponses,
  PainAnswer,
  Weekday,
} from "@/lib/contracts/week-zero";

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
): string {
  if (value === null || value === "") return "Non renseigné";
  return `${value}${unit}`;
}

export function displayPain(value: PainAnswer): string {
  if (value === "YES") return "Oui";
  if (value === "NO") return "Non";
  return "Non évalué";
}

export function displayWeekdays(days: Weekday[]): string {
  if (days.length === 0) return "Non renseigné";
  return days.map((day) => weekdayLabels[day]).join(", ");
}

export function formatAssessmentDate(
  value: string | null,
  timezone: string,
): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("fr-CA", {
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
): AssessmentSection[] {
  return [
    {
      id: "measurements",
      title: "Mesures",
      items: [
        {
          label: "Poids corporel",
          value: displayValue(responses.measurements.bodyWeightLb, " lb"),
        },
        {
          label: "Tour de taille au nombril",
          value: displayValue(responses.measurements.waistIn, " po"),
        },
        {
          label: "Poitrine",
          value: displayValue(responses.measurements.chestIn, " po"),
        },
        {
          label: "Hanches",
          value: displayValue(responses.measurements.hipsIn, " po"),
        },
        {
          label: "Bras droit fléchi",
          value: displayValue(responses.measurements.rightArmIn, " po"),
        },
        {
          label: "Cuisse droite",
          value: displayValue(responses.measurements.rightThighIn, " po"),
        },
        {
          label: "Autres mesures ou précisions",
          value: displayValue(responses.measurements.other),
        },
      ],
    },
    {
      id: "mobility",
      title: "Mobilité et douleur",
      items: [
        {
          label: "Douleur — squat ou jambes",
          value: displayPain(responses.mobility.painSquat),
        },
        {
          label: "Douleur — charnière, RDL ou soulevé de terre",
          value: displayPain(responses.mobility.painHinge),
        },
        {
          label: "Douleur — poussée ou développé",
          value: displayPain(responses.mobility.painPush),
        },
        {
          label: "Douleur — tirage",
          value: displayPain(responses.mobility.painPull),
        },
        {
          label: "Douleur — cardio",
          value: displayPain(responses.mobility.painCardio),
        },
        {
          label: "Mouvement le plus limité",
          value: displayValue(responses.mobility.limitedMovement),
        },
        {
          label: "Mouvement le plus confortable",
          value: displayValue(responses.mobility.comfortableMovement),
        },
        {
          label: "Zone tendue ou raide",
          value: displayValue(responses.mobility.tightArea),
        },
      ],
    },
    {
      id: "availability",
      title: "Disponibilités",
      items: [
        {
          label: "Jours disponibles",
          value: displayWeekdays(responses.availability.days),
        },
        {
          label: "Meilleur moment",
          value: displayValue(responses.availability.bestTime),
        },
        {
          label: "Durée possible par séance",
          value: displayValue(
            responses.availability.sessionDurationMinutes,
            " min",
          ),
        },
        {
          label: "Séances possibles par semaine",
          value: displayValue(responses.availability.sessionsPerWeek),
        },
        {
          label: "Contraintes ou précisions",
          value: displayValue(responses.availability.constraints),
        },
      ],
    },
  ];
}
