"use client";

import { Icon } from "@/components/fe/icon";
import { WeekZeroSubmittedNotice } from "@/features/client/week-zero/week-zero-submitted-notice";
import { OnboardingAction } from "@/features/client/onboarding/onboarding-action";
import { ClientProgramAction } from "@/features/training/client/client-program";
import { ClientFamilyPhoto, ClientVisualShell } from "./client-visual-shell";
import type { ClientDashboard } from "./contracts";
import styles from "./client-home-pilot.module.css";

type ClientHomePilotProps = Readonly<{
  dashboard: ClientDashboard | null;
  failed: boolean;
  signingOut: boolean;
  signOutError: string | null;
  onRetry(): void;
  onSignOut(): void;
}>;

export function ClientHomePilot({ dashboard, failed, signingOut, signOutError, onRetry, onSignOut }: ClientHomePilotProps) {
  const french = dashboard?.locale !== "en-CA";
  const t = (fr: string, en: string) => french ? fr : en;
  return <ClientVisualShell name={dashboard?.displayName} french={french} current="home" accountAction={
    <button className="fe-button" type="button" onClick={onSignOut} disabled={signingOut}>
      {signingOut ? t("Déconnexion…", "Signing out…") : t("Se déconnecter", "Sign out")}
    </button>
  }>
    {signOutError ? <div className={styles.alert} role="alert"><Icon name="alert" />{signOutError}</div> : null}
    {dashboard && !failed ? <WeekZeroSubmittedNotice french={french} /> : null}
    <div data-pilot-state={failed ? "error" : dashboard ? "ready" : "loading"} aria-busy={!failed && !dashboard ? true : undefined}>
      <section className={styles.hero} data-pilot-hero="" aria-labelledby="pilot-title">
        <picture>
          <source media="(max-width: 42rem)" srcSet="/brand/client/portal-hero-mobile.webp" width="1086" height="362" />
          <img src="/brand/client/portal-hero.webp" width="2172" height="724" alt="" fetchPriority="high" />
        </picture>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p>{dashboard && !failed ? t(`Bienvenue, ${dashboard.displayName}.`, `Welcome, ${dashboard.displayName}.`) : "The Legacy Protocol"}</p>
          <h1 id="pilot-title">{t("Ton parcours commence ici.", "Your journey starts here.")}</h1>
          <span>{t("Une étape à la fois. On avance ensemble.", "One step at a time. We move forward together.")}</span>
          {dashboard && !failed ? <span className={styles.heroStatus}><Icon name="check" />{t("Accès actif", "Access active")}</span> : null}
        </div>
      </section>
      {failed ? <section className={styles.errorPanel}>
        <div role="alert"><h2>{t("Ton portail est indisponible pour le moment", "Your portal is temporarily unavailable")}</h2><p>{t("On n’arrive pas à ouvrir cette page. Vérifie ta connexion, puis réessaie.", "We couldn’t open this page. Check your connection, then try again.")}</p></div>
        <button className="fe-button fe-button-primary" type="button" onClick={onRetry}>{t("Réessayer", "Try again")}</button>
      </section> : !dashboard ? <div className={styles.loadingStatus} role="status">{t("Ton portail s’ouvre…", "Opening your portal…")}</div> : <div className={styles.contentGrid}>
        <div className={styles.tasks}>
          <section className={styles.primaryPanel} data-pilot-primary="" aria-label={t("Ta prochaine étape", "Your next step")}>
            <p className={styles.panelEyebrow}>{t("Ta prochaine étape", "Your next step")}</p>
            <div className={styles.primaryCopy}>
              <OnboardingAction french={french} actionClassName="fe-button fe-button-primary" visualCheckpoint />
            </div>
          </section>
          <section aria-labelledby="client-landmarks">
            <h2 id="client-landmarks" className={styles.landmarksTitle}>{t("Ton parcours", "Your journey")}</h2>
            <div className={styles.landmarks}>
              <a href="/client/onboarding?view=responses"><span className={styles.landmarkNumber}>01</span><div><strong>{t("Mon questionnaire", "My questionnaire")}</strong><small>{t("Six sections, à ton rythme.", "Six sections, at your own pace.")}</small></div><Icon name="arrow" /></a>
              <a href="/client/week-zero"><span className={styles.landmarkNumber}>02</span><div><strong>{t("Semaine zéro", "Week Zero")}</strong><small>{t("Photos · Charges de départ · Cardio · Sensations", "Photos · Starting loads · Cardio · How you felt")}</small></div><Icon name="arrow" /></a>
            </div>
          </section>
          <div className={styles.programPanel}><ClientProgramAction french={french} /></div>
          <details className={styles.accountDetails}>
            <summary>{t("Mes informations", "My information")}</summary>
            <dl>
              <div><dt>{t("Nom", "Name")}</dt><dd>{dashboard.displayName}</dd></div>
              <div><dt>{t("Langue", "Language")}</dt><dd>{french ? "Français" : "English"}</dd></div>
              <div><dt>{t("Fuseau horaire", "Time zone")}</dt><dd>{dashboard.timezone.replaceAll("_", " ").replaceAll("/", " / ")}</dd></div>
            </dl>
          </details>
        </div>
        <ClientFamilyPhoto />
      </div>}
    </div>
  </ClientVisualShell>;
}
