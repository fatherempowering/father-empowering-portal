"use client";

import Image from "next/image";
import Link from "next/link";
import { usePortalLanguage } from "./portal-preferences";

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = usePortalLanguage();
  return (
    <Link
      className={compact ? "fe-brand-compact" : "fe-brand"}
      href="/"
      aria-label={t("Father Empowering — accueil", "Father Empowering — home")}
    >
      <Image
        src={compact ? "/icon-192.png" : "/brand/fe-logo-splash.png"}
        alt={compact ? "" : "Father Empowering"}
        width={compact ? 44 : 158}
        height={compact ? 44 : 102}
        priority
      />
      {compact ? (
        <span>
          Father
          <br />
          Empowering
        </span>
      ) : null}
    </Link>
  );
}
