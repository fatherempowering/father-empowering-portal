/** Presentation only: the server derives ownership from the authenticated identity. */
export function coachClientLabel(name: string, isOwnProfile?: boolean): string {
  return isOwnProfile === true ? `${name} — Mon profil personnel` : name;
}
