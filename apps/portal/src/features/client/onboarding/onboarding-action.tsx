"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InitialAssessmentAction } from "@/features/client/week-zero/initial-assessment-action";
import { onboardingSnapshotSchema, type OnboardingStatus } from "@/lib/contracts/onboarding";

/** Intake is the first suggested action, not a lock on the separate assessment. */
export function OnboardingAction({ french, actionClassName = "fe-button fe-button-primary" }: {
  french: boolean;
  actionClassName?: string;
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
    <p>{t("Ta session n’est plus valide. Tes réponses déjà enregistrées restent conservées.", "Your session is no longer valid. Your previously saved answers are retained.")}</p>
    <Link className={actionClassName} href="/client-login">{t("Me reconnecter", "Sign in again")}</Link>
  </div>;
  if (failed) return <div role="alert">
    <h2>{t("Ta prochaine étape ne peut pas être chargée", "Your next step could not be loaded")}</h2>
    <p>{t("Nous n’avons pas pu vérifier l’état de ton questionnaire. Tes réponses enregistrées restent conservées.", "We could not check your questionnaire’s status. Your saved answers are retained.")}</p>
    <button className={actionClassName} type="button" onClick={() => setAttempt((n) => n+1)}>{t("Réessayer", "Try again")}</button>
    <p><a href="/client/onboarding">{t("Ouvrir mon questionnaire d’accueil", "Open my welcome questionnaire")}</a></p>
    <p><Link href="/client/week-zero">{t("Accéder à mon bilan initial", "Open my initial assessment")}</Link></p>
  </div>;
  if (!status) return <p role="status">{t("Chargement de ta prochaine étape…", "Loading your next step…")}</p>;
  if (status === "SUBMITTED") return <div data-onboarding-status={status}>
    <InitialAssessmentAction french={french} actionClassName={actionClassName} />
    <p><a href="/client/onboarding">{t("Consulter mon questionnaire d’accueil transmis", "View my submitted welcome questionnaire")}</a></p>
  </div>;
  return <div data-onboarding-status={status}>
    <h2>{t("Commençons par mieux te connaître", "Let’s get to know you")}</h2>
    <p>{t("Tes objectifs, ta santé, tes habitudes et ton quotidien : complète ton questionnaire d’accueil à ton rythme. Ton brouillon reste privé jusqu’à sa transmission à Max.", "Your goals, health, habits and daily life: complete your welcome questionnaire at your own pace. Your draft stays private until you submit it to Max.")}</p>
    <a className={actionClassName} href="/client/onboarding">{status === "DRAFT"
      ? t("Reprendre mon questionnaire d’accueil", "Continue my welcome questionnaire")
      : t("Compléter mon questionnaire d’accueil", "Complete my welcome questionnaire")}</a>
    <p>{t("Ton bilan de mesures et de mobilité est une étape distincte. ", "Your measurements and mobility assessment is a separate step. ")}<Link href="/client/week-zero">{t("Accéder à mon bilan initial", "Open my initial assessment")}</Link></p>
  </div>;
}
