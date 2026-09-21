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
      homeIntro: "Your Father Empowering space.",
      readyStatus: "Portal activated",
      readyTitle: "Your portal is ready.",
      readyDescription:
        "Your access to the Legacy Protocol is confirmed. Start with Today to see your next action.",
      openToday: "Open Today",
      todayIntro: "Your current focus, in one place.",
      nextActionLabel: "Next action",
      nextActionStatus: "Up to date",
      nextActionTitle: "You’re up to date.",
      nextActionDescription:
        "Nothing to do right now. Your portal access remains active.",
      informationTitle: "Your information",
      nameLabel: "Name",
      languageLabel: "Portal language",
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
    homeIntro: "Ton espace Father Empowering.",
    readyStatus: "Portail activé",
    readyTitle: "Ton portail est prêt.",
    readyDescription:
      "Ton accès au Legacy Protocol est confirmé. Commence par Aujourd’hui pour voir ta prochaine action.",
    openToday: "Voir aujourd’hui",
    todayIntro: "Ton focus actuel, au même endroit.",
    nextActionLabel: "Prochaine action",
    nextActionStatus: "À jour",
    nextActionTitle: "Tu es à jour.",
    nextActionDescription:
      "Rien à faire pour le moment. Ton accès au portail reste actif.",
    informationTitle: "Tes informations",
    nameLabel: "Nom",
    languageLabel: "Langue du portail",
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
