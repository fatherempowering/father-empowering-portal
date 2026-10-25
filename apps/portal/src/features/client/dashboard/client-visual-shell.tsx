/* eslint-disable @next/next/no-img-element -- local art-directed brand assets. */
"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/fe/icon";
import { usePortalAccess } from "@/components/fe/portal-access-context";
import { selectNumericInputOnFocus } from "@/components/fe/select-numeric-input";
import { LegacyClientHeader } from "@/components/fe/legacy-client-header";
import styles from "./client-home-pilot.module.css";

/** Shared presentation shell. Week Zero is the representative V1.1 checkpoint;
 * other screens keep their existing presentation until visual validation. */
export function ClientVisualShell({ children, name, french, current, accountAction, documentNavigation = false }: {
  children: ReactNode;
  name?: string;
  french: boolean;
  current: "home" | "onboarding" | "week-zero";
  accountAction: ReactNode;
  documentNavigation?: boolean;
}) {
  const { isStaff } = usePortalAccess();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menu = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const identity = name ?? (french ? "Portail Legacy" : "Legacy portal");
  const initials = name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("") || "FE";
  const NavLink = documentNavigation ? "a" : Link;
  const links = [
    { id: "home", href: "/client", label: french ? "Accueil" : "Home", icon: "home" as const },
    { id: "today", href: "/client/today", label: french ? "Aujourd’hui" : "Today", icon: "today" as const },
    { id: "onboarding", href: "/client/onboarding?view=responses", label: french ? "Mon questionnaire" : "My questionnaire", icon: "check" as const },
    { id: "week-zero", href: "/client/week-zero", label: french ? "Semaine zéro" : "Week Zero", icon: "check" as const },
    { id: "program", href: "/client/program", label: french ? "Mes entraînements" : "My workouts", icon: "today" as const },
  ];
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeDesktopMenu = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeDesktopMenu);
    return () => desktop.removeEventListener("change", closeDesktopMenu);
  }, []);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); requestAnimationFrame(() => toggle.current?.focus()); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [open]);
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (!open || event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'));
    const first = elements[0]; const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className={styles.pilot} data-client-v2-pilot="" data-client-visual={current} data-menu-open={open} lang={french ? "fr" : "en"}>
    <aside className={styles.sidebar} data-pilot-sidebar="" id={menuId} ref={menu}
      role={open ? "dialog" : undefined} aria-modal={open ? true : undefined}
      aria-label={open ? french ? "Menu Client" : "Client menu" : undefined} onKeyDown={trapFocus}>
      <button className={styles.menuClose} type="button" aria-label={french ? "Fermer le menu" : "Close menu"} onClick={() => { setOpen(false); requestAnimationFrame(() => toggle.current?.focus()); }}><Icon name="close" />{french ? "Fermer" : "Close"}</button>
      <NavLink className={styles.brand} href="/" aria-label={french ? "Father Empowering — accueil" : "Father Empowering — home"}><img src="/brand/fe-logo-splash.png" width="862" height="557" alt="Father Empowering" /></NavLink>
      <p className={styles.sidebarProtocol}>The Legacy Protocol</p>
      <nav aria-label={french ? "Navigation principale" : "Main navigation"}>
        {links.map((item) => {
          const Entry = item.id === "onboarding" ? "a" : NavLink;
          return <Entry key={item.id} className={styles.navigationLink} href={item.href} aria-current={current === item.id ? "page" : undefined} onClick={() => setOpen(false)}><Icon name={item.icon} />{item.label}</Entry>;
        })}
      </nav>
      <div className={styles.sidebarBottom}>
        <p className={styles.motto}>Shape<br />your legacy.</p>
        <p className={styles.accountLabel}>{french ? "Compte" : "Account"}</p>
        <div className={styles.identity}><span aria-hidden="true">{initials}</span><div><strong>{identity}</strong><small>{french ? "Ton portail Legacy" : "Your Legacy portal"}</small></div></div>
        {isStaff ? <a className={styles.navigationLink} href="/coach" onClick={() => setOpen(false)}><Icon name="users" />{french ? "Portail Coach" : "Coach portal"}</a> : null}
        <div className={styles.accountAction} onClick={() => {
          // Logout errors are announced in the page; never leave that page inert
          // behind the mobile menu while waiting for the existing logout request.
          if (open) { setOpen(false); requestAnimationFrame(() => toggle.current?.focus()); }
        }}>{accountAction}</div>
      </div>
    </aside>
    <div className={styles.workspace} inert={open ? true : undefined}>
      {current === "home" ? <LegacyClientHeader french={french} name={name} active="home" menu={
        <button className={styles.menuToggle} type="button" ref={toggle} aria-controls={menuId} aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /><span>Menu</span></button>
      } /> : <header className={styles.topbar} data-pilot-topbar="">
        <div className={styles.frameTitle}><strong>The Legacy Protocol</strong><span>{french ? "Portail Legacy" : "Legacy portal"}</span></div>
        <NavLink className={styles.mobileBrand} href="/" aria-label="Father Empowering"><img src="/icon-192.png" width="44" height="44" alt="" /><span>Father Empowering</span></NavLink>
        <span className={styles.topbarIdentity}><span aria-hidden="true">{initials}</span>{identity}</span>
        <button className={styles.menuToggle} type="button" ref={toggle} aria-controls={menuId} aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /><span>Menu</span></button>
      </header>}
      <main className={styles.main} id="main-content" onFocusCapture={selectNumericInputOnFocus}>{children}</main>
    </div>
  </div>;
}

export function ClientFamilyPhoto({ compact = false }: { compact?: boolean }) {
  return <aside className={`${styles.familyPhoto} ${compact ? styles.familyCompact : ""}`} aria-label="A stronger you. A brighter them.">
    <img src="/brand/client/father-child.webp" width="720" height="1080" alt="" loading="lazy" decoding="async" />
    <p>A stronger you.<br />A brighter them.</p>
  </aside>;
}
