/* eslint-disable @next/next/no-img-element -- the approved desktop/mobile sources and crops are selected with picture. */
"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Icon } from "@/components/fe/icon";
import {
  clientPortalCopy,
  formatClientToday,
} from "./client-portal-presentation";
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

export function ClientHomePilot({
  dashboard,
  failed,
  signingOut,
  signOutError,
  onRetry,
  onSignOut,
}: ClientHomePilotProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menu = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const french = dashboard?.locale !== "en-CA";
  const locale = french ? "fr" : "en";
  const labels = pilotLabels(locale);
  const identity = dashboard?.displayName ?? labels.clientSpace;

  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement | HTMLAnchorElement>("a, button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuToggle.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  function trapMenuFocus(event: KeyboardEvent<HTMLElement>) {
    if (!menuOpen || event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={styles.pilot}
      data-client-v2-pilot=""
      data-menu-open={menuOpen}
      lang={locale}
    >
      <aside
        className={styles.sidebar}
        data-pilot-sidebar=""
        id={menuId}
        ref={menu}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? "true" : undefined}
        aria-label={menuOpen ? labels.menuDialog : undefined}
        onKeyDown={trapMenuFocus}
      >
        <button
          className={styles.menuClose}
          type="button"
          aria-label={labels.closeMenu}
          onClick={() => {
            setMenuOpen(false);
            menuToggle.current?.focus();
          }}
        >
          <Icon name="close" />
          <span>{labels.close}</span>
        </button>
        <Link className={styles.brand} href="/" aria-label={labels.brandHome}>
          <img
            src="/brand/fe-logo-splash.png"
            width="862"
            height="557"
            alt="Father Empowering"
          />
        </Link>
        <p className={styles.sidebarProtocol}>The Legacy Protocol</p>
        <nav aria-label={labels.navigation}>
          <p className={styles.navigationLabel}>{labels.clientSpace}</p>
          <Link
            className={styles.navigationLink}
            href="/client"
            aria-current="page"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="home" />
            {labels.home}
          </Link>
          <Link
            className={styles.navigationLink}
            href="/client/today"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="today" />
            {labels.today}
          </Link>
        </nav>
        <div className={styles.sidebarBottom}>
          <p className={styles.motto}>Shape your legacy.</p>
          <p className={styles.accountLabel}>{labels.account}</p>
          <div className={styles.identity}>
            <span aria-hidden="true">FE</span>
            <div>
              <strong>{identity}</strong>
              <small>Father Empowering</small>
            </div>
          </div>
          <button
            className={styles.signOut}
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? labels.signingOut : labels.signOut}
          </button>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar} data-pilot-topbar="">
          <div className={styles.frameTitle}>
            <strong>The Legacy Protocol</strong>
            <span>Shape your legacy.</span>
          </div>
          <Link className={styles.mobileBrand} href="/" aria-label={labels.brandHome}>
            <img src="/icon-192.png" width="44" height="44" alt="" />
            <span>Father Empowering</span>
          </Link>
          <span className={styles.topbarIdentity}>{identity}</span>
          <button
            className={styles.menuToggle}
            type="button"
            ref={menuToggle}
            aria-controls={menuId}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
            <span>{labels.menu}</span>
          </button>
        </header>

        <main className={styles.main} id="main-content">
          {signOutError ? (
            <div className={styles.alert} role="alert">
              <Icon name="alert" />
              <span>{signOutError}</span>
            </div>
          ) : null}
          {failed ? (
            <PilotError locale={locale} onRetry={onRetry} />
          ) : dashboard ? (
            <PilotReady dashboard={dashboard} />
          ) : (
            <PilotLoading locale={locale} />
          )}
        </main>
      </div>
    </div>
  );
}

function PilotReady({ dashboard }: { dashboard: ClientDashboard }) {
  const locale = dashboard.locale === "en-CA" ? "en" : "fr";
  const labels = pilotLabels(locale);
  const copy = clientPortalCopy(dashboard);
  const timeZone = dashboard.timezone.replaceAll("_", " ").replaceAll("/", " / ");

  return (
    <div className={styles.ready} data-pilot-state="ready">
      <PilotHero
        locale={locale}
        title={labels.portalTitle}
        detail={
          locale === "en"
            ? `Welcome, ${dashboard.displayName}.`
            : `Bienvenue, ${dashboard.displayName}.`
        }
        status={labels.accessActive}
      />
      <ul
        className={styles.factStrip}
        data-pilot-facts=""
        aria-label={labels.portalFacts}
      >
        <li>
          <span className={styles.factIcon}><Icon name="check" /></span>
          <div><small>{labels.access}</small><strong>{labels.accessActive}</strong></div>
        </li>
        <li>
          <span className={styles.factIcon}><Icon name="today" /></span>
          <div><small>{labels.program}</small><strong>{labels.notAvailableHere}</strong></div>
        </li>
        <li>
          <span className={styles.factIcon}><Icon name="clock" /></span>
          <div><small>{labels.today}</small><strong>{formatClientToday(dashboard)}</strong></div>
        </li>
      </ul>
      <div className={styles.contentGrid}>
        <section
          className={styles.primaryPanel}
          data-pilot-primary=""
          aria-labelledby="pilot-content-title"
        >
          <div className={styles.panelHeader}>
            <p>{labels.contentState}</p>
            <span className={styles.statusBadge}>
              <Icon name="check" />
              {labels.accessActive}
            </span>
          </div>
          <div className={styles.primaryCopy}>
            <h2 id="pilot-content-title">{labels.accessConfirmed}</h2>
            <p>{labels.noProgramAction}</p>
          </div>
        </section>

        <section className={styles.accountPanel} aria-labelledby="pilot-account-title">
          <p className={styles.panelEyebrow}>{labels.account}</p>
          <h2 id="pilot-account-title">{copy.informationTitle}</h2>
          <p>{copy.readyDescription}</p>
          <dl>
            <div><dt>{copy.nameLabel}</dt><dd>{dashboard.displayName}</dd></div>
            <div><dt>{copy.languageLabel}</dt><dd>{copy.languageValue}</dd></div>
            <div><dt>{copy.timezoneLabel}</dt><dd>{timeZone}</dd></div>
          </dl>
        </section>
      </div>
      <p className={styles.signature}>A stronger you. A brighter them.</p>
    </div>
  );
}

function PilotLoading({ locale }: { locale: "fr" | "en" }) {
  const labels = pilotLabels(locale);
  return (
    <div aria-busy="true" data-pilot-state="loading">
      <PilotHero
        locale={locale}
        title={labels.portalTitle}
        detail={labels.loading}
      />
      <p className={styles.loadingStatus} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        {labels.loading}
      </p>
      <div className={styles.loadingGrid} aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}

function PilotError({
  locale,
  onRetry,
}: {
  locale: "fr" | "en";
  onRetry(): void;
}) {
  const labels = pilotLabels(locale);
  return (
    <>
      <PilotHero
        locale={locale}
        title={labels.portalTitle}
        detail={labels.clientSpace}
      />
      <section
        className={styles.errorPanel}
        data-pilot-state="error"
        aria-labelledby="pilot-error-title"
      >
        <span className={styles.errorIcon} aria-hidden="true"><Icon name="alert" /></span>
        <div role="alert">
          <h1 id="pilot-error-title">{labels.errorTitle}</h1>
          <p>{labels.errorDescription}</p>
        </div>
        <button className={styles.primaryAction} type="button" onClick={onRetry}>
          {labels.retry}
        </button>
      </section>
    </>
  );
}

function PilotHero({
  locale,
  title,
  detail,
  status,
}: {
  locale: "fr" | "en";
  title: string;
  detail: string;
  status?: string;
}) {
  const labels = pilotLabels(locale);
  return (
    <section
      className={styles.hero}
      data-pilot-hero=""
      aria-labelledby="pilot-title"
    >
      <picture>
        <source
          media="(max-width: 42rem)"
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
        />
      </picture>
      <div className={styles.heroShade} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <p>{labels.heroEyebrow}</p>
        <h1 id="pilot-title">{title}</h1>
        <span>{detail}</span>
      </div>
      {status ? <span className={styles.heroStatus}>{status}</span> : null}
    </section>
  );
}

function pilotLabels(locale: "fr" | "en") {
  if (locale === "en") {
    return {
      access: "Portal access",
      accessActive: "Access active",
      accessConfirmed: "Your access is confirmed.",
      account: "Account",
      brandHome: "Father Empowering — home",
      clientSpace: "Client portal",
      close: "Close",
      closeMenu: "Close menu",
      contentState: "Portal content",
      errorDescription: "This page could not be loaded. Check your connection and try again.",
      errorTitle: "Portal temporarily unavailable",
      heroEyebrow: "The Legacy Protocol",
      home: "Home",
      loading: "Loading your portal…",
      menu: "Menu",
      menuDialog: "Client menu",
      navigation: "Main navigation",
      noProgramAction:
        "No program action is available in this portal right now. You have nothing to complete here.",
      notAvailableHere: "Not available here",
      portalFacts: "Current portal information",
      portalTitle: "Your portal.",
      program: "Program",
      retry: "Try again",
      signOut: "Sign out",
      signingOut: "Signing out…",
      today: "Today",
    } as const;
  }
  return {
    access: "Accès au portail",
    accessActive: "Accès actif",
    accessConfirmed: "Ton accès est confirmé.",
    account: "Compte",
    brandHome: "Father Empowering — accueil",
    clientSpace: "Espace Client",
    close: "Fermer",
    closeMenu: "Fermer le menu",
    contentState: "Contenu du portail",
    errorDescription: "Impossible de charger cette page. Vérifie ta connexion et réessaie.",
    errorTitle: "Portail temporairement indisponible",
    heroEyebrow: "The Legacy Protocol",
    home: "Accueil",
    loading: "Chargement de ton portail…",
    menu: "Menu",
    menuDialog: "Menu Client",
    navigation: "Navigation principale",
    noProgramAction:
      "Aucune action de programme n’est disponible dans ce portail pour le moment. Tu n’as rien à compléter ici.",
    notAvailableHere: "Non disponible ici",
    portalFacts: "Informations actuelles du portail",
    portalTitle: "Ton portail.",
    program: "Programme",
    retry: "Réessayer",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    today: "Aujourd’hui",
  } as const;
}
