"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  weekZeroAcquisitionSnapshotSchema,
  type WeekZeroAcquisitionSnapshot,
} from "@/lib/contracts/week-zero-acquisition";

/** The next action comes from the saved assessment, never from account activation. */
export function InitialAssessmentAction({ french, actionClassName = "fe-button fe-button-primary", hideProgramAvailability = false }: {
  french: boolean;
  actionClassName?: string;
  /** The visual Home reads the actual publication separately, never infers it from Week Zero. */
  hideProgramAvailability?: boolean;
}) {
  const [status, setStatus] = useState<WeekZeroAcquisitionSnapshot["status"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const t = (fr: string, en: string) => french ? fr : en;
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let active = true;
    setFailed(false); setStatus(null); setSessionExpired(false);
    fetch("/api/v1/client/week-zero/acquisition", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          if (active) setSessionExpired(true);
          throw new Error("Session unavailable");
        }
        if (!r.ok) throw new Error("Unavailable");
        const result = await r.json();
        const snapshot = weekZeroAcquisitionSnapshotSchema.parse(result.data?.acquisition);
        if (active) setStatus(snapshot.status);
      }).catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  if (sessionExpired) return <div role="alert">
    <h2>{t("Reconnecte-toi pour continuer", "Sign in again to continue")}</h2>
    <p>{t("Ta session n’est plus valide. Tes réponses déjà enregistrées restent conservées.", "Your session is no longer valid. Your previously saved answers are retained.")}</p>
    <Link className={actionClassName} href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>
  </div>;
  if (failed) return <div role="alert">
    <h2>{t("Ta semaine zéro est indisponible pour le moment", "Your Week Zero is temporarily unavailable")}</h2>
    <p>{t("On n’a pas pu retrouver ta prochaine étape. Réessaie pour la consulter.", "We couldn’t find your next step. Try again to view it.")}</p>
    <button type="button" className={actionClassName} onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button>
  </div>;
  if (!status) return <p role="status">{t("Chargement de ta prochaine étape…", "Loading your next step…")}</p>;
  const sent = status === "SUBMITTED";
  return <div data-initial-assessment-status={status}>
    <h2>{sent ? t("Semaine zéro transmise", "Week Zero submitted") : t("Ta semaine zéro", "Your Week Zero")}</h2>
    <p>{sent
      ? hideProgramAvailability
        ? t("Ta semaine zéro est envoyée. Ton coach peut maintenant consulter tes réponses. Aucun nouvel envoi n’est nécessaire.", "Your Week Zero has been sent. Your coach can now review your answers. You don’t need to send it again.")
        : t("Ta semaine zéro est envoyée. Ton coach peut maintenant consulter tes réponses. Tu n’as rien à renvoyer ; ton programme n’est pas encore disponible ici.", "Your Week Zero has been sent. Your coach can now review your answers. You don’t need to send it again; your program is not available here yet.")
      : t("On pose les bases de ton programme. Commence par tes photos et tes mesures, puis suis les étapes pour les huit mouvements, le cardio Concept2 et ta mobilité. Enregistre ton brouillon ; tu enverras le tout à ton coach quand chaque élément sera renseigné.", "Let’s lay the groundwork for your program. Start with your photos and measurements, then follow the steps for the eight movements, Concept2 cardio and mobility. Save your draft; you’ll send everything to your coach once each item is filled in.")}</p>
    <Link className={actionClassName} href="/client/week-zero">{sent
      ? t("Consulter ma semaine zéro", "View my Week Zero")
      : status === "DRAFT" ? t("Reprendre ma semaine zéro", "Continue my Week Zero") : t("Commençons ma semaine zéro", "Start my Week Zero")}</Link>
  </div>;
}
