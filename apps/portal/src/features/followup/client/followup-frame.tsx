"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import styles from "./followup.module.css";

export function useFollowupLanguage() {
  const [french, setFrench] = useState(true);
  useEffect(() => { setFrench(new URLSearchParams(window.location.search).get("language") !== "en"); }, []);
  function changeLanguage() {
    const url = new URL(window.location.href);
    url.searchParams.set("language", french ? "en" : "fr");
    window.history.replaceState(window.history.state, "", url);
    setFrench(!french);
  }
  return { french, changeLanguage };
}

export function FollowupFrame({ current, title, subtitle, french, changeLanguage, children, dirty = false }: {
  current: "nutrition" | "check-in" | "progression"; title: string; subtitle: string;
  french: boolean; changeLanguage(): void; children: ReactNode; dirty?: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const warning = french ? "Tes modifications ne sont pas encore enregistrées. Quitter cette page ?" : "Your changes have not been saved yet. Leave this page?";
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm(warning)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", followLink, true); };
  }, [dirty, warning]);
  async function logout() {
    if (signingOut || (dirty && !window.confirm(warning))) return;
    setSigningOut(true); setLogoutFailed(false);
    const ok = await requestClientLogout(destination => window.location.replace(destination));
    if (!ok) { setSigningOut(false); setLogoutFailed(true); }
  }
  return <AppShell space="client" current={current} locale={french ? "fr" : "en"} documentNavigation legacyClient accountAction={
    <button className="fe-button" type="button" disabled={signingOut} onClick={() => void logout()}>{signingOut ? french ? "Déconnexion…" : "Signing out…" : french ? "Se déconnecter" : "Sign out"}</button>
  }>
    <div className={styles.page} lang={french ? "fr" : "en"} data-followup={current}>
      <header className={styles.hero}>
        <div><p className={styles.kicker}>THE LEGACY PROTOCOL</p><h1>{title}</h1><p>{subtitle}</p></div>
        <button type="button" className={`${styles.quietButton} ${styles.languageButton}`} aria-label={french ? "English" : "Français"} onClick={changeLanguage}>{french ? "EN" : "FR"}</button>
      </header>
      {logoutFailed ? <p className={styles.error} role="alert">{french ? "Déconnexion impossible. Réessaie." : "Unable to sign out. Try again."}</p> : null}
      {children}
    </div>
  </AppShell>;
}

export function FollowupLoading({ french }: { french: boolean }) { return <p className={styles.panel} role="status">{french ? "Chargement de tes informations…" : "Loading your information…"}</p>; }
export function FollowupLoadError({ french, retry }: { french: boolean; retry(): void }) {
  return <section className={styles.panel}><p className={styles.error} role="alert">{french ? "Tes informations n’ont pas pu être chargées. Réessaie avec une connexion disponible." : "Your information could not be loaded. Retry when connected."}</p><button className={styles.button} type="button" onClick={retry}>{french ? "Réessayer" : "Try again"}</button></section>;
}

export function localized(value: { fr: string; en: string }, french: boolean) { return value[french ? "fr" : "en"] || value.fr || value.en; }
export function displayDate(value: string, french: boolean) {
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(french ? "fr-CA" : "en-CA", { dateStyle: "medium", ...(calendarDate ? { timeZone: "UTC" } : {}) }).format(new Date(calendarDate ? `${value}T12:00:00Z` : value));
}
