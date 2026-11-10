import { UiText } from "@/components/fe/ui-text";
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
      <p className="fe-kicker"><UiText>Espace Coach</UiText></p>
      <h1 className="fe-title"><UiText>Accède à ton espace Coach.</UiText></h1>
      <p className="fe-intro"><UiText>
        Entre ton courriel et ton mot de passe.
      </UiText></p>
      {password === "updated" ? (
        <Feedback tone="success"><UiText>
          Ton mot de passe est enregistré. Connecte-toi pour continuer.
        </UiText></Feedback>
      ) : error === "recovery" ? (
        <Feedback><UiText>Le lien est invalide ou expiré. Demande un nouveau lien.</UiText></Feedback>
      ) : error === "unavailable" ? (
        <Feedback><UiText>
          La connexion est momentanément indisponible. Réessaie dans quelques instants.
          Inutile de modifier ton mot de passe.
        </UiText></Feedback>
      ) : error ? (
        <Feedback><UiText>Le courriel ou le mot de passe est invalide.</UiText></Feedback>
      ) : null}
      <form action={signInCoachAction} className="fe-form">
        <label className="fe-field"><UiText>
          Courriel
          </UiText><input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField />
        <SubmitButton pendingLabel="Connexion…"><UiText>
          Se connecter
        </UiText></SubmitButton>
      </form>
      <p className="fe-auth-secondary">
        <Link href="/forgot-password"><UiText>Définir ou réinitialiser mon mot de passe</UiText></Link>
      </p>
      <p className="fe-auth-secondary"><UiText>
        Tu es client ? </UiText><Link href="/client-login"><UiText>Accéder à mon portail</UiText></Link>
      </p>
    </AuthShell>
  );
}
