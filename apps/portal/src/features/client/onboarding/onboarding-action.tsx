"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InitialAssessmentAction } from "@/features/client/week-zero/initial-assessment-action";
import { onboardingSnapshotSchema, type OnboardingStatus } from "@/lib/contracts/onboarding";

/** Onboarding first; Week Zero stays available in its single navigation entry. */
export function OnboardingAction({ french, actionClassName = "fe-button fe-button-primary", visualCheckpoint = false }: {
  french: boolean;
  actionClassName?: string;
  visualCheckpoint?: boolean;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const t = (fr: string, en: string) => french ? fr : en;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let active = true;
    setFailed(false); setStatus(null); setSessionExpired(false);
    fetch("/api/v1/client/onboarding", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (active) setSessionExpired(true);
          throw new Error("Session unavailable");
        }
        if (!response.ok) throw new Error("Unavailable");
        const snapshot = onboardingSnapshotSchema.parse((await response.json()).data?.intake);
        if (active) setStatus(snapshot.status);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  if (sessionExpired) return <div role="alert">
    <h2>{t("Reconnecte-toi pour continuer", "Sign in again to continue")}</h2>
    <p>{t("Ta connexion n’est plus active. Tes réponses déjà enregistrées sont conservées.", "You’re no longer signed in. Your previously saved answers are kept.")}</p>
    <Link className={actionClassName} href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>
  </div>;
  if (failed) return <div role="alert">
    <h2>{t("Ta prochaine étape est momentanément inaccessible", "Your next step is temporarily unavailable")}</h2>
    <p>{t("On n’a pas pu ouvrir ton questionnaire. Tes réponses enregistrées sont conservées.", "We couldn’t open your questionnaire. Your saved answers are kept.")}</p>
    <button className={actionClassName} type="button" onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button>
    <p><a href="/client/onboarding">{t("Ouvrir mon questionnaire d’accueil", "Open my welcome questionnaire")}</a></p>
  </div>;
  if (!status) return <p role="status">{t("Chargement de ta prochaine étape…", "Loading your next step…")}</p>;
  if (status === "SUBMITTED") return <div data-onboarding-status={status}>
    <InitialAssessmentAction french={french} actionClassName={actionClassName} hideProgramAvailability={visualCheckpoint} />
  </div>;
  return <div data-onboarding-status={status}>
    <h2>{visualCheckpoint ? t("Faisons connaissance.", "Let’s get to know you.") : t("Commençons par mieux te connaître", "Let’s get to know you")}</h2>
    <p>{visualCheckpoint ? t("Parle-nous de tes objectifs, de tes habitudes et de ton quotidien. Max s’appuiera sur tes réponses pour préparer ton accompagnement.", "Tell us about your goals, habits and everyday life. Max will use your answers to prepare your coaching.") : t("Prenons le temps de mieux te connaître : tes objectifs, ta santé, tes habitudes et ton quotidien. Avance à ton rythme. Ton brouillon reste privé jusqu’à l’envoi à Max.", "Let’s take the time to get to know your goals, health, habits and everyday life. Go at your own pace. Your draft stays private until you send it to Max.")}</p>
    <a className={actionClassName} href="/client/onboarding">{status === "DRAFT"
      ? t("Reprendre mon questionnaire", "Continue my questionnaire")
      : t("Commencer mon questionnaire", "Start my questionnaire")}</a>
    {visualCheckpoint ? <small>{t("Ton brouillon reste privé jusqu’à sa transmission.", "Your draft stays private until you submit it.")}</small> : null}
  </div>;
}
