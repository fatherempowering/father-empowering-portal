import type { ClientDashboard } from "./contracts";

export type ClientPortalCopy = Readonly<{
  homeLabel: string;
  todayLabel: string;
  welcome: string;
  homeIntro: string;
  readyStatus: string;
  readyTitle: string;
  readyDescription: string;
  openToday: string;
  todayIntro: string;
  nextActionLabel: string;
  nextActionStatus: string;
  nextActionTitle: string;
  nextActionDescription: string;
  informationTitle: string;
  nameLabel: string;
  languageLabel: string;
  languageValue: string;
  timezoneLabel: string;
  signOut: string;
  signingOut: string;
  signOutError: string;
}>;

export function clientPortalCopy(client: ClientDashboard): ClientPortalCopy {
  if (client.locale === "en-CA") {
    return {
      homeLabel: "Home",
      todayLabel: "Today",
      welcome: `Welcome, ${client.displayName}.`,
      homeIntro: "Your Father Empowering portal.",
      readyStatus: "Portal activated",
      readyTitle: "Your Legacy access",
      readyDescription:
        "Your access to the Legacy Protocol is confirmed. You can find your journey in this portal.",
      openToday: "Open Today",
      todayIntro: "Your next step, made clear.",
      nextActionLabel: "Your workouts",
      nextActionStatus: "Access active",
      nextActionTitle: "Your portal is ready.",
      nextActionDescription:
        "Your program isn’t available in this portal yet.",
      informationTitle: "Your information",
      nameLabel: "Name",
      languageLabel: "Language of your portal",
      languageValue: "English",
      timezoneLabel: "Time zone",
      signOut: "Sign out",
      signingOut: "Signing out…",
      signOutError: "Unable to sign out. Please try again.",
    };
  }

  return {
    homeLabel: "Accueil",
    todayLabel: "Aujourd’hui",
    welcome: `Bienvenue, ${client.displayName}.`,
    homeIntro: "Ton portail Father Empowering.",
    readyStatus: "Portail activé",
    readyTitle: "Ton accès Legacy",
    readyDescription:
      "Ton accès au Legacy Protocol est confirmé. Tu peux retrouver ton parcours dans ce portail.",
    openToday: "Voir aujourd’hui",
    todayIntro: "Ta prochaine étape, simplement.",
    nextActionLabel: "Tes entraînements",
    nextActionStatus: "Accès actif",
    nextActionTitle: "Ton portail est prêt.",
    nextActionDescription:
      "Ton programme n’est pas encore disponible dans ce portail.",
    informationTitle: "Tes informations",
    nameLabel: "Nom",
    languageLabel: "Langue de ton portail",
    languageValue: "Français",
    timezoneLabel: "Fuseau horaire",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    signOutError: "Impossible de te déconnecter. Réessaie.",
  };
}

export function formatClientToday(
  client: Pick<ClientDashboard, "locale" | "timezone">,
  date: Date = new Date(),
): string {
  try {
    return new Intl.DateTimeFormat(client.locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: client.timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(client.locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date);
  }
}
