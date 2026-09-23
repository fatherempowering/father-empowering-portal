"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icon";

export function AppShell({
  children,
  space,
  name,
  locale = "fr",
  current = space === "coach" ? "clients" : "home",
  accountAction,
}: {
  children: ReactNode;
  space: "coach" | "client";
  name?: string;
  locale?: "fr" | "en";
  current?: "clients" | "home" | "today" | "onboarding" | "week-zero";
  accountAction?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const navId = useId();
  const french = locale === "fr";
  const spaceLabel = space === "coach" ? "Espace Coach" : "The Legacy Protocol";
  const identity =
    name ??
    (space === "coach"
      ? "Espace Coach"
      : french
        ? "Espace Client"
        : "Client portal");
  const navigation =
    space === "coach"
      ? [{ href: "/coach", label: "Clients", icon: "users" as const, id: "clients" as const }]
      : [
          {
            href: "/client",
            label: french ? "Accueil" : "Home",
            icon: "home" as const,
            id: "home" as const,
          },
          {
            href: "/client/today",
            label: french ? "Aujourd’hui" : "Today",
            icon: "today" as const,
            id: "today" as const,
          },
          {
            href: "/client/onboarding",
            label: french ? "Questionnaire d’accueil" : "Welcome questionnaire",
            icon: "check" as const,
            id: "onboarding" as const,
          },
          {
            href: "/client/week-zero",
            label: french ? "Week Zero · Bilan initial" : "Week Zero · Initial assessment",
            icon: "check" as const,
            id: "week-zero" as const,
          },
        ];
  const activeLabel =
    navigation.find((item) => item.id === current)?.label ?? navigation[0].label;
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(navId)
      ?.querySelector<HTMLAnchorElement>("nav a")
      ?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, navId]);

  return (
    <div className="fe-app-shell" data-menu-open={open} lang={locale}>
      <aside className="fe-sidebar" id={navId}>
        <Brand />
        <nav aria-label={french ? "Navigation principale" : "Main navigation"}>
          <p className="fe-side-label">{spaceLabel}</p>
          {navigation.map((item) => {
            // A document entry lets the long intake form protect browser Back
            // with beforeunload, without adding a parallel history router.
            const NavLink = item.id === "onboarding" ? "a" : Link;
            return <NavLink
              className="fe-side-link"
              href={item.href}
              aria-current={item.id === current ? "page" : undefined}
              onClick={() => setOpen(false)}
              key={item.id}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>;
          })}
        </nav>
        <div className="fe-side-bottom">
          <p className="fe-side-motto">Shape your legacy.</p>
          {accountAction ? (
            <p className="fe-side-account-label">
              {french ? "Compte" : "Account"}
            </p>
          ) : null}
          <div className="fe-identity">
            <span className="fe-avatar" aria-hidden="true">
              FE
            </span>
            <div>
              <strong>{identity}</strong>
              <span>Father Empowering</span>
            </div>
          </div>
          {accountAction ? (
            <div className="fe-side-account-action">{accountAction}</div>
          ) : null}
        </div>
      </aside>
      <div className="fe-workspace">
        <header className="fe-topbar">
          <div className="fe-breadcrumb">
            <span>{spaceLabel}</span>
            <span aria-hidden="true">/</span>
            <strong>{activeLabel}</strong>
          </div>
          <div className="fe-mobile-brand">
            <Brand compact />
          </div>
          <span className="fe-desktop-identity">{identity}</span>
          <button
            className="fe-menu-button"
            type="button"
            ref={toggle}
            aria-controls={navId}
            aria-expanded={open}
            aria-label={
              french
                ? open
                  ? "Fermer le menu"
                  : "Ouvrir le menu"
                : open
                  ? "Close menu"
                  : "Open menu"
            }
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </header>
        <main className="fe-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
