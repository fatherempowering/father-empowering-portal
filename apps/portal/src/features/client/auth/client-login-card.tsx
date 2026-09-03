"use client";

import { useState, type FormEvent } from "react";

import styles from "@/features/client/activation/client-activation.module.css";

type Step = "EMAIL" | "CODE" | "VERIFYING";

export function ClientLoginCard() {
  const [step, setStep] = useState<Step>("EMAIL");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/client-otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Réessaie dans quelques instants.");
      setStep("CODE");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réessaie dans quelques instants.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("VERIFYING");
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/client-otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const body = await response.json().catch(() => ({})) as {
        data?: { redirectTo?: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Le code est invalide ou expiré.");
      window.location.replace(body.data?.redirectTo ?? "/client");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le code est invalide ou expiré.");
      setStep("CODE");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="client-login-title">
        <div className={styles.mark} aria-hidden="true">FE</div>
        <p className={styles.eyebrow}>FATHER EMPOWERING</p>
        <h1 id="client-login-title">Connexion Client</h1>
        <p className={styles.intro}>
          Reçois un code temporaire par courriel. Aucun mot de passe n’est requis.
        </p>

        {step === "EMAIL" ? (
          <form className={styles.form} onSubmit={requestOtp}>
            <label htmlFor="client-login-email">Courriel</label>
            <input
              id="client-login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
              style={{ fontFamily: "system-ui", fontSize: 16, letterSpacing: 0 }}
            />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button className={styles.primary} type="submit" disabled={busy}>
              {busy ? "Envoi…" : "Envoyer mon code"}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={verifyOtp}>
            <p className={styles.success} role="status">Si ce compte est actif, le code a été envoyé.</p>
            <label htmlFor="client-login-otp">Code à 6 chiffres</label>
            <input
              id="client-login-otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              minLength={6}
              maxLength={7}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/[^0-9 ]/g, ""))}
              required
              autoFocus
              disabled={step === "VERIFYING"}
            />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button className={styles.primary} type="submit" disabled={step === "VERIFYING"}>
              {step === "VERIFYING" ? "Connexion…" : "Ouvrir mon portail"}
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => {
                setStep("EMAIL");
                setOtp("");
                setError(null);
              }}
              disabled={step === "VERIFYING"}
            >
              Changer de courriel
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
