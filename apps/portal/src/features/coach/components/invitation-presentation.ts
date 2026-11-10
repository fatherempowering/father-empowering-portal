import { translateUi } from "@/components/fe/ui-copy";
import type { CoachDashboardClient } from "../model";

export type AccessPresentation = {
  label: string;
  tone: "active" | "warning" | "neutral";
  detail: string;
  icon: "check" | "clock" | "alert";
};

function date(value: string | null, timezone: string, language: "fr" | "en"): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  try {
    return new Intl.DateTimeFormat(`${language}-CA`, {
      day: "numeric",
      month: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(`${language}-CA`, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}

/** Presentation only; backend statuses and mutation permissions stay authoritative. */
function rawInvitationPresentation(
  client: CoachDashboardClient,
  now: number,
  language: "fr" | "en",
): AccessPresentation {
  if (client.status === "ACTIVE")
    return {
      label: "Actif",
      tone: "active",
      icon: "check",
      detail: "Portail activé",
    };
  if (client.status === "SUSPENDED")
    return {
      label: "Suspendu",
      tone: "neutral",
      icon: "alert",
      detail: "Accès suspendu",
    };
  if (client.status === "ARCHIVED")
    return {
      label: "Archivé",
      tone: "neutral",
      icon: "clock",
      detail: "Accès désactivé",
    };
  const invitation = client.invitation;
  if (!invitation)
    return {
      label: "Activation en attente",
      tone: "neutral",
      icon: "clock",
      detail: "Invitation indisponible",
    };
  if (invitation.status === "REVOKED")
    return {
      label: "Invitation révoquée",
      tone: "neutral",
      icon: "alert",
      detail: "Activation en attente",
    };
  if (invitation.status === "ACCEPTED")
    return {
      label: "Activation en attente",
      tone: "neutral",
      icon: "clock",
      detail: "Invitation acceptée · actualisation en cours",
    };
  if (
    invitation.status === "EXPIRED" ||
    Date.parse(invitation.expiresAt) <= now
  )
    return {
      label: "Invitation expirée",
      tone: "warning",
      icon: "alert",
      detail: "Renvoie une invitation pour activer le portail.",
    };
  if (invitation.status === "PENDING")
    return {
      label: "Activation en attente",
      tone: "neutral",
      icon: "clock",
      detail: "Envoi en préparation",
    };
  const sent = date(invitation.sentAt, client.timezone, language);
  const expires = date(invitation.expiresAt, client.timezone, language);
  return {
    label: "Activation en attente",
    tone: "neutral",
    icon: "clock",
    detail: [
      sent ? `${translateUi("Invitation envoyée", language)} · ${sent}` : "Invitation envoyée",
      expires ? `${language === "fr" ? "Expire le" : "Expires on"} ${expires}` : null,
    ]
      .filter(Boolean)
      .join(" — "),
  };
}

export function invitationPresentation(client: CoachDashboardClient, now: number, language: "fr" | "en" = "fr"): AccessPresentation {
  const result = rawInvitationPresentation(client, now, language);
  return { ...result, label: translateUi(result.label, language), detail: translateUi(result.detail, language) };
}
