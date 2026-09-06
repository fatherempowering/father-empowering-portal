import Link from "next/link";

const accessLinkStyle = {
  display: "block",
  padding: "14px 18px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  color: "#111827",
  fontWeight: 700,
  textAlign: "center",
  textDecoration: "none",
} as const;

export default function HomePage() {
  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 24, fontFamily: "system-ui" }}>
      <p>FATHER EMPOWERING</p>
      <h1>Portail sécurisé Coach et Client</h1>
      <p>Choisis ton espace pour continuer.</p>
      <nav aria-label="Accès au portail" style={{ display: "grid", gap: 12, marginTop: 28 }}>
        <Link href="/login" style={accessLinkStyle}>
          Connexion Coach
        </Link>
        <Link href="/client-login" style={accessLinkStyle}>
          Connexion Client
        </Link>
      </nav>
    </main>
  );
}
