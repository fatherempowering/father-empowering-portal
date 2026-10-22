/* eslint-disable @next/next/no-img-element -- preserve the approved picture sources and intrinsic dimensions exactly. */
import Link from "next/link";

import { LandingLanguage } from "./landing-language";
import styles from "./landing-page.module.css";

export type LandingLocale = "en" | "fr";

export const landingCopy = {
  en: {
    brandName: "FATHER EMPOWERING",
    protocol: "THE LEGACY PROTOCOL",
    skip: "Skip to login options",
    home: "Father Empowering — home",
    headline: ["Same", "standards.", "Different", "day."],
    enter: "Enter your space.",
    coach: "Coach login",
    client: "Client login",
    pillars: ["Training", "Nutrition", "Progress", "Family"],
    pillarsLabel: "Father Empowering pillars",
    values: ["Structure", "Discipline", "Freedom"],
    valuesLabel: "Our values",
    promise: ["A stronger you.", "A brighter them."],
    loginOptions: "Login options",
    description:
      "Father Empowering. Same standards. Different day. Enter your space.",
  },
  fr: {
    brandName: "FATHER EMPOWERING",
    protocol: "THE LEGACY PROTOCOL",
    skip: "Aller aux options de connexion",
    home: "Father Empowering — accueil",
    headline: ["Mêmes", "standards.", "Nouveau", "jour."],
    enter: "Entre dans ton espace.",
    coach: "Connexion coach",
    client: "Connexion client",
    pillars: ["Entraînement", "Nutrition", "Progression", "Famille"],
    pillarsLabel: "Piliers Father Empowering",
    values: ["Structure", "Discipline", "Liberté"],
    valuesLabel: "Nos valeurs",
    promise: ["Plus fort pour toi.", "Plus loin pour eux."],
    loginOptions: "Options de connexion",
    description:
      "Father Empowering. Mêmes standards. Nouveau jour. Entre dans ton espace.",
  },
} as const;

export function resolveLandingLocale(
  value: string | string[] | undefined,
): LandingLocale {
  return value === "fr" ? "fr" : "en";
}

export function LandingPage({ locale }: { locale: LandingLocale }) {
  const copy = landingCopy[locale];
  return (
    <>
      <LandingLanguage locale={locale} />
      <a className={styles.skipLink} href="#entry">
        {copy.skip}
      </a>
      <div
        className={`${styles.landing} fe-public-landing`}
        data-fe-public-landing=""
        lang={locale}
      >
        <picture className={styles.hero}>
          <source
            media="(max-width: 47.5rem)"
            srcSet="/brand/landing/hero-mobile.webp"
            width="1024"
            height="1536"
          />
          <img
            src="/brand/landing/hero-desktop.webp"
            width="1536"
            height="1024"
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className={styles.heroShade} aria-hidden="true" />

        <header className={styles.masthead}>
          <Link
            className={styles.brand}
            href={`/?lang=${locale}`}
            aria-label={copy.home}
          >
            <img
              src="/brand/fe-logo-splash.png"
              width="862"
              height="557"
              alt="Father Empowering"
            />
          </Link>
          <p className={styles.protocol}>
            <span>{copy.protocol}</span>
            <i aria-hidden="true" />
          </p>
        </header>

        <main className={styles.entryGrid} id="entry">
          <section className={styles.access} aria-labelledby="headline">
            <div>
              <p className={styles.eyebrow}>{copy.brandName}</p>
              <h1 id="headline" className={styles.headline}>
                {copy.headline.map((line, index) => (
                  <span className={index > 1 ? styles.accent : undefined} key={line}>
                    {line}
                  </span>
                ))}
              </h1>
              <p className={styles.invitation}>{copy.enter}</p>
            </div>
            <nav className={styles.loginOptions} aria-label={copy.loginOptions}>
              <Link className={`${styles.loginLink} ${styles.primary}`} href="/login">
                <span>{copy.coach}</span>
                <ArrowIcon />
              </Link>
              <Link
                className={`${styles.loginLink} ${styles.secondary}`}
                href="/client-login"
              >
                <span>{copy.client}</span>
                <ArrowIcon />
              </Link>
            </nav>
            <ul className={styles.pillars} aria-label={copy.pillarsLabel}>
              <li><TrainingIcon /><span>{copy.pillars[0]}</span></li>
              <li><NutritionIcon /><span>{copy.pillars[1]}</span></li>
              <li><ProgressIcon /><span>{copy.pillars[2]}</span></li>
              <li><FamilyIcon /><span>{copy.pillars[3]}</span></li>
            </ul>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.legacyPromise}>
            <p><span>{copy.promise[0]}</span><span>{copy.promise[1]}</span></p>
            <span className={styles.brandRule} aria-hidden="true" />
          </div>
          <div className={styles.principles}>
            <ul aria-label={copy.valuesLabel}>
              {copy.values.map((value) => <li key={value}>{value}</li>)}
            </ul>
            <span className={styles.brandRule} aria-hidden="true" />
          </div>
        </footer>
      </div>
    </>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h17M13 5l7 7-7 7" /></svg>;
}

function TrainingIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M10 16h12M3 13v6M29 13v6" /><rect x="6" y="7" width="4" height="18" rx="1.5" /><rect x="22" y="7" width="4" height="18" rx="1.5" /></svg>;
}

function NutritionIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m7 4 7 7m-10-4 7 7m-6-9 9 9m-6 4 17-14c4 4 2 8-1 10L9 28M17 19l9 9M5 12c-2-3-1-5 1-7m6 0c3 1 5 5 2 8" /></svg>;
}

function ProgressIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path className={styles.solid} d="M4 21h6v8H4zM13 13h6v16h-6zM22 4h6v25h-6z" /></svg>;
}

function FamilyIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="8" r="4" /><circle cx="5" cy="10" r="3" /><circle cx="27" cy="10" r="3" /><path d="M9 28v-6a7 7 0 0 1 14 0v6H9ZM5 18a5 5 0 0 0-4 5v3h4m22-8a5 5 0 0 1 4 5v3h-4" /></svg>;
}
