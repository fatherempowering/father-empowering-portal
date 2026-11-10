/** Presentation only: the server derives ownership from the authenticated identity. */
export function coachClientLabel(name: string, isOwnProfile?: boolean, language: "fr" | "en" = "fr"): string {
  return isOwnProfile === true ? `${name} — ${language === "fr" ? "Mon profil personnel" : "My personal profile"}` : name;
}
