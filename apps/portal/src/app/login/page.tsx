import Link from "next/link";
import { AuthShell } from "@/components/fe/auth-shell";
import { Feedback } from "@/components/fe/feedback";
import { PasswordField } from "@/components/fe/password-field";
import { SubmitButton } from "@/components/fe/submit-button";
import { signInCoachAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach</p>
      <h1 className="fe-title">Bienvenue, Max.</h1>
      <p className="fe-intro">
        Connecte-toi pour retrouver tes clients et gérer leurs accès.
      </p>
      {error ? (
        <Feedback>Le courriel ou le mot de passe est invalide.</Feedback>
      ) : null}
      <form action={signInCoachAction} className="fe-form">
        <label className="fe-field">
          Courriel
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField />
        <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
      </form>
      <p className="fe-auth-secondary">
        Tu es client ? <Link href="/client-login">Accéder à mon portail</Link>
      </p>
    </AuthShell>
  );
}
