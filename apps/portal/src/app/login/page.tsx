import Link from "next/link";
import { AuthShell } from "@/components/fe/auth-shell";
import { Feedback } from "@/components/fe/feedback";
import { PasswordField } from "@/components/fe/password-field";
import { SubmitButton } from "@/components/fe/submit-button";
import { signInCoachAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; password?: string }>;
}) {
  const { error, password } = await searchParams;
  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach</p>
      <h1 className="fe-title">Accède à ton espace Coach.</h1>
      <p className="fe-intro">
        Entre ton courriel et ton mot de passe.
      </p>
      {password === "updated" ? (
        <Feedback tone="success">
          Ton mot de passe est enregistré. Connecte-toi pour continuer.
        </Feedback>
      ) : error === "recovery" ? (
        <Feedback>Le lien est invalide ou expiré. Demande un nouveau lien.</Feedback>
      ) : error === "unavailable" ? (
        <Feedback>La connexion est momentanément indisponible. Réessaie.</Feedback>
      ) : error ? (
        <Feedback>Le courriel ou le mot de passe est invalide.</Feedback>
      ) : null}
      <form action={signInCoachAction} className="fe-form">
        <label className="fe-field">
          Courriel
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField />
        <SubmitButton pendingLabel="Connexion et envoi du code…">
          Se connecter
        </SubmitButton>
      </form>
      <p className="fe-auth-secondary">
        <Link href="/forgot-password">Définir ou réinitialiser mon mot de passe</Link>
      </p>
      <p className="fe-auth-secondary">
        Tu es client ? <Link href="/client-login">Accéder à mon portail</Link>
      </p>
    </AuthShell>
  );
}
