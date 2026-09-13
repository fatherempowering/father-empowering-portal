import Link from "next/link";
import { AuthShell } from "@/components/fe/auth-shell";
import { Icon } from "@/components/fe/icon";

export default function HomePage() {
  return (
    <AuthShell>
      <p className="fe-kicker">Father Empowering</p>
      <h1 className="fe-title">Entre dans ton espace.</h1>
      <p className="fe-intro">Choisis ton accès pour continuer.</p>
      <nav aria-label="Accès au portail" className="fe-access-options">
        <Link
          className="fe-button fe-button-primary fe-button-wide"
          href="/login"
        >
          Connexion Coach
          <Icon name="arrow" />
        </Link>
        <Link className="fe-button fe-button-wide" href="/client-login">
          Connexion Client
          <Icon name="arrow" />
        </Link>
      </nav>
    </AuthShell>
  );
}
