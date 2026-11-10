export type LandingLocale = "en" | "fr";

export const landingCopy = {
  en: {
    brandName: "FATHER EMPOWERING",
    protocol: "THE LEGACY PROTOCOL",
    skip: "Skip to login options",
    home: "Father Empowering — home",
    headline: ["Same", "standards.", "Different", "day."],
    enter: "Enter your space.",
    coach: "Coach login",
    client: "Client login",
    pillars: ["Training", "Nutrition", "Progress", "Family"],
    pillarsLabel: "Father Empowering pillars",
    values: ["Structure", "Discipline", "Freedom"],
    valuesLabel: "Our values",
    promise: ["A stronger you.", "A brighter them."],
    loginOptions: "Login options",
    description:
      "Father Empowering. Same standards. Different day. Enter your space.",
  },
  fr: {
    brandName: "FATHER EMPOWERING",
    protocol: "THE LEGACY PROTOCOL",
    skip: "Aller aux options de connexion",
    home: "Father Empowering — accueil",
    headline: ["Mêmes", "standards.", "Nouveau", "jour."],
    enter: "Entre dans ton espace.",
    coach: "Connexion coach",
    client: "Connexion client",
    pillars: ["Entraînement", "Nutrition", "Progression", "Famille"],
    pillarsLabel: "Piliers Father Empowering",
    values: ["Structure", "Discipline", "Liberté"],
    valuesLabel: "Nos valeurs",
    promise: ["Plus fort pour toi.", "Plus loin pour eux."],
    loginOptions: "Options de connexion",
    description:
      "Father Empowering. Mêmes standards. Nouveau jour. Entre dans ton espace.",
  },
} as const;

export function resolveLandingLocale(
  value: string | string[] | undefined,
): LandingLocale {
  return value === "fr" ? "fr" : "en";
}


