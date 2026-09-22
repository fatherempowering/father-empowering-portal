"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { initialAssessmentSnapshotSchema, type InitialAssessmentStatus } from "@/lib/contracts/week-zero";

/** The next action comes from the saved assessment, never from account activation. */
export function InitialAssessmentAction({ french, actionClassName = "fe-button fe-button-primary" }: {
  french: boolean;
  actionClassName?: string;
}) {
  const [status, setStatus] = useState<InitialAssessmentStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const t = (fr: string, en: string) => french ? fr : en;
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let active = true;
    setFailed(false); setStatus(null); setSessionExpired(false);
    fetch("/api/v1/client/week-zero", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          if (active) setSessionExpired(true);
          throw new Error("Session unavailable");
        }
        if (!r.ok) throw new Error("Unavailable");
        const result = await r.json();
        const snapshot = initialAssessmentSnapshotSchema.parse(result.data?.assessment);
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
    <h2>{t("Ton bilan ne peut pas être chargé", "Your assessment could not be loaded")}</h2>
    <p>{t("L’état de tes réponses n’a pas pu être vérifié. Réessaie pour retrouver ta prochaine étape.", "The status of your answers could not be checked. Retry to find your next step.")}</p>
    <button type="button" className={actionClassName} onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button>
  </div>;
  if (!status) return <p role="status">{t("Chargement de ta prochaine étape…", "Loading your next step…")}</p>;
  const sent = status === "SUBMITTED";
  return <div data-initial-assessment-status={status}>
    <h2>{sent ? t("Bilan initial transmis", "Initial assessment submitted") : t("Ton point de départ : le bilan initial", "Your starting point: the initial assessment")}</h2>
    <p>{sent
      ? t("Ton Coach peut consulter tes réponses dans ton dossier. Tu n’as rien à renvoyer. Ton programme n’est pas encore disponible ici.", "Your Coach can read your answers in your file. There is nothing to resend. Your program is not available here yet.")
      : t("Renseigne tes mesures, ta mobilité et tes disponibilités pour aider ton Coach à préparer la suite. Enregistre un brouillon, puis transmets-le quand tu es prêt.", "Share your measurements, mobility and availability to help your Coach plan the next steps. Save a draft, then submit it when you are ready.")}</p>
    <Link className={actionClassName} href="/client/week-zero">{sent
      ? t("Consulter mon bilan transmis", "View my submitted assessment")
      : status === "DRAFT" ? t("Reprendre mon bilan initial", "Continue my initial assessment") : t("Compléter mon bilan initial", "Complete my initial assessment")}</Link>
  </div>;
}
