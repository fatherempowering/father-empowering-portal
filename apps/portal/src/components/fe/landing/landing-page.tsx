/* eslint-disable @next/next/no-img-element -- preserve the approved picture sources and intrinsic dimensions exactly. */
"use client";
import Link from "next/link";
import { useEffect } from "react";
import { initializePortalLanguage, usePortalLanguage } from "../portal-preferences";
import { LanguageControl } from "../preference-controls";
import { landingCopy, type LandingLocale } from "./landing-copy";
export { landingCopy, resolveLandingLocale } from "./landing-copy";

import styles from "./landing-page.module.css";

export function LandingPage({ locale }: { locale: LandingLocale }) {
  const { language } = usePortalLanguage(locale);
  useEffect(() => { initializePortalLanguage(locale); }, [locale]);
  const copy = landingCopy[language];
  return (
    <>
      <div className="fe-landing-language"><LanguageControl fallback={locale} /></div>
      <a className={styles.skipLink} href="#entry">
        {copy.skip}
      </a>
      <div
        className={`${styles.landing} fe-public-landing`}
        data-fe-public-landing=""
        lang={language}
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
            href={`/?lang=${language}`}
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
