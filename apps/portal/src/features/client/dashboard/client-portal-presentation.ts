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
      readyTitle: "Portal access",
      readyDescription:
        "Your access to the Legacy Protocol is confirmed.",
      openToday: "Open Today",
      todayIntro: "The current state of your portal.",
      nextActionLabel: "Program",
      nextActionStatus: "Access active",
      nextActionTitle: "Your access is active.",
      nextActionDescription:
        "This version of the portal does not include your program yet.",
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
    readyTitle: "Accès au portail",
    readyDescription:
      "Ton accès au Legacy Protocol est confirmé.",
    openToday: "Voir aujourd’hui",
    todayIntro: "L’état actuel de ton portail.",
    nextActionLabel: "Programme",
    nextActionStatus: "Accès actif",
    nextActionTitle: "Ton accès est actif.",
    nextActionDescription:
      "Cette version du portail ne contient pas encore ton programme.",
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
