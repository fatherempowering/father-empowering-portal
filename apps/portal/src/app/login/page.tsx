import { signInCoachAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 440, margin: "64px auto", padding: 24, fontFamily: "system-ui" }}>
      <p>FATHER EMPOWERING</p>
      <h1>Connexion Coach</h1>
      <p>Accès réservé à Max et aux administrateurs autorisés.</p>
      {error ? <p role="alert">Le courriel ou le mot de passe est invalide.</p> : null}
      <form action={signInCoachAction} style={{ display: "grid", gap: 16 }}>
        <label>
          Courriel
          <input name="email" type="email" autoComplete="email" required style={{ width: "100%" }} />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            style={{ width: "100%" }}
          />
        </label>
        <button type="submit">Se connecter</button>
      </form>
    </main>
  );
}
