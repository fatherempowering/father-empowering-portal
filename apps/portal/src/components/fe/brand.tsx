import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={compact ? "fe-brand-compact" : "fe-brand"}
      href="/"
      aria-label="Father Empowering — accueil"
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
