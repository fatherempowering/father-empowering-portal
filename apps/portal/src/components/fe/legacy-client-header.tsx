"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./legacy-client-header.module.css";

/** The Legacy navigation, backed only by routes implemented in this application. */
export function LegacyClientHeader({ french, name, active, menu }: {
  french: boolean;
  name?: string;
  active: "home" | "training";
  menu?: ReactNode;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const connectivity = () => setOnline(navigator.onLine);
    tick(); connectivity();
    const timer = setInterval(tick, 30_000);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    return () => { clearInterval(timer); window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); };
  }, []);
  const language = french ? "fr" : "en";
  const pending = french ? "Module pas encore disponible" : "Module not available yet";
  return <>
    <header className={styles.header} data-legacy-client-header="">
      <div className={styles.identity}>
        <p className={styles.eyebrow}>Legacy Protocol</p>
        <strong>{name ?? (french ? "Mon portail" : "My portal")}</strong>
        <p className={styles.welcome}>{french ? "Bienvenue dans ton portail." : "Welcome back to your portal."}</p>
        {online !== null ? <span className={styles.connectivity} data-online={online} title={french ? "Connexion réseau de cet appareil" : "This device’s network connection"}><i aria-hidden="true" />{online ? (french ? "En ligne" : "Online") : (french ? "Hors ligne" : "Offline")}</span> : null}
      </div>
      <div className={styles.tools}>
        {now ? <div className={styles.clock}><time dateTime={now.toISOString()}>{now.toLocaleTimeString(french ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><span>{now.toLocaleDateString(french ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric" })}</span></div> : null}
        {menu}
      </div>
    </header>
    <nav className={styles.navigation} aria-label={french ? "Navigation du portail" : "Portal navigation"} data-legacy-client-tabs="">
      <a href={`/client?language=${language}`} aria-current={active === "home" ? "page" : undefined}><span aria-hidden="true">⌂</span>{french ? "Accueil" : "Home"}</a>
      <a href={`/client/program?language=${language}`} aria-current={active === "training" ? "page" : undefined}><span aria-hidden="true">⚒</span>{french ? "Entraînement" : "Training"}</a>
      <button type="button" disabled title={pending}><span aria-hidden="true">♨</span>Nutrition<small>{french ? "À venir" : "Coming soon"}</small></button>
      <button type="button" disabled title={pending}><span aria-hidden="true">☷</span>Check-in<small>{french ? "À venir" : "Coming soon"}</small></button>
      <button type="button" disabled title={pending}><span aria-hidden="true">▲</span>Progression<small>{french ? "À venir" : "Coming soon"}</small></button>
      <a href={`/client/program?language=${language}#workout-history-title`}><span aria-hidden="true">↻</span>{french ? "Historique" : "History"}</a>
    </nav>
  </>;
}
