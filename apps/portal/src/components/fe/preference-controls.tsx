"use client";

import { useEffect } from "react";
import { parseLanguage, setPortalLanguage, usePortalLanguage, usePortalTheme, type PortalLanguage } from "./portal-preferences";
import "./portal-settings.css";

export function LanguageControl({ fallback = "fr", reload = false }: { fallback?: PortalLanguage; reload?: boolean }) {
  const { language, setLanguage } = usePortalLanguage(fallback);
  return <div className="fe-language-control" role="group" aria-label="Langue / Language">
    {(["fr", "en"] as const).map((value) => <button key={value} type="button" lang={value} aria-pressed={language === value} onClick={() => {
      setLanguage(value);
      if (reload) { const url = new URL(window.location.href); url.searchParams.set("lang", value); window.location.assign(url); }
    }}>{value === "fr" ? "Français" : "English"}</button>)}
  </div>;
}

export function PortalPreferenceEffects() {
  const { language } = usePortalLanguage();
  const { theme } = usePortalTheme();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = parseLanguage(params.get("language")) ?? parseLanguage(params.get("lang"));
    if (fromUrl) setPortalLanguage(fromUrl);
    else document.documentElement.lang = language;
  }, [language]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return null;
}

export function SkipLink() {
  const { t } = usePortalLanguage();
  return <a className="fe-skip-link" href="#main-content">{t("Aller au contenu", "Skip to content")}</a>;
}
