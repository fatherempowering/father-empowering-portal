"use client";

import { useEffect, useSyncExternalStore } from "react";

export type PortalLanguage = "fr" | "en";
export type PortalTheme = "light" | "dark";
const LANGUAGE_KEY = "fe-language";
const THEME_KEY = "fe-theme";
const changed = "fe:preferences";
const volatilePreferences = new Map<string, string>();

export function parseLanguage(value: unknown): PortalLanguage | null {
  return value === "fr" || value === "en" ? value : null;
}

function readPreference(key: string): string | null {
  if (typeof document === "undefined") return null;
  if (volatilePreferences.has(key)) return volatilePreferences.get(key)!;
  try {
    const cookie = document.cookie.split(/;\s*/).find((item) => item.startsWith(`${key}=`))?.slice(key.length + 1);
    if (cookie) return cookie;
  } catch { /* Some private browser contexts disable cookies. */ }
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function savePreference(key: string, value: string) {
  // Display preferences only. Never store credentials, profile or health data here.
  try { document.cookie = `${key}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Keep the choice in memory if storage is blocked. */ }
  try { window.localStorage.setItem(key, value); } catch { /* Display preferences are optional persistence. */ }
  volatilePreferences.delete(key);
  if (readPreference(key) !== value) volatilePreferences.set(key, value);
}

function languageSnapshot(): PortalLanguage | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return parseLanguage(params.get("language")) ?? parseLanguage(params.get("lang")) ?? parseLanguage(readPreference(LANGUAGE_KEY));
}

function themeSnapshot(): PortalTheme {
  return readPreference(THEME_KEY) === "dark" ? "dark" : "light";
}

function subscribe(callback: () => void) {
  window.addEventListener(changed, callback);
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener(changed, callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
  };
}

export function setPortalLanguage(language: PortalLanguage) {
  if (!parseLanguage(language)) return;
  savePreference(LANGUAGE_KEY, language);
  const url = new URL(window.location.href);
  // Preserve invitation hashes, workout IDs and all other navigation state.
  for (const key of ["language", "lang"]) if (url.searchParams.has(key)) url.searchParams.set(key, language);
  window.history.replaceState(window.history.state, "", url);
  document.documentElement.lang = language;
  window.dispatchEvent(new Event(changed));
}

export function setPortalTheme(theme: PortalTheme) {
  if (theme !== "light" && theme !== "dark") return;
  savePreference(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(changed));
}

/** Read the browser preference before persisting a server-rendered default. */
export function initializePortalLanguage(fallback: PortalLanguage) {
  setPortalLanguage(languageSnapshot() ?? fallback);
}

const serverLanguage = () => null;
const serverTheme = (): PortalTheme => "light";

export function usePortalLanguage(fallback: PortalLanguage = "fr") {
  const language = useSyncExternalStore(subscribe, languageSnapshot, serverLanguage) ?? fallback;
  return { language, french: language === "fr", setLanguage: setPortalLanguage,
    t: (fr: string, en: string) => language === "fr" ? fr : en };
}

export function usePortalTheme() {
  return { theme: useSyncExternalStore(subscribe, themeSnapshot, serverTheme), setTheme: setPortalTheme };
}

/** Profile language supplies only the first preference, never overrides a choice. */
export function useClientLanguage(locale?: "fr-CA" | "en-CA") {
  const result = usePortalLanguage(locale === "en-CA" ? "en" : "fr");
  useEffect(() => {
    if (locale && languageSnapshot() === null) setPortalLanguage(locale === "en-CA" ? "en" : "fr");
  }, [locale]);
  return result;
}
