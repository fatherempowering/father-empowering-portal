"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/fe/auth-shell";
import { CodeInput } from "@/components/fe/code-input";
import { Feedback } from "@/components/fe/feedback";

type Step = "EMAIL" | "CODE" | "VERIFYING";

export function ClientLoginCard() {
  const [step, setStep] = useState<Step>("EMAIL");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function requestOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || step === "VERIFYING") return;
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      const response = await fetch("/api/v1/auth/client-otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Réessaie dans quelques instants.",
        );
      setResent(step === "CODE");
      setOtp("");
      setStep("CODE");
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Réessaie dans quelques instants.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || step === "VERIFYING" || !/^\d{6}$/.test(otp)) return;
    setStep("VERIFYING");
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/client-otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { redirectTo?: string };
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Le code est invalide ou expiré.",
        );
      window.location.replace(body.data?.redirectTo ?? "/client");
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Le code est invalide ou expiré.",
      );
      setStep("CODE");
    }
  }

  return (
    <AuthShell>
      <p className="fe-kicker">The Legacy Protocol</p>
      <h1 className="fe-title">Retrouve ton portail.</h1>
      <p className="fe-intro">
        {step === "EMAIL"
          ? "Reçois un code de connexion par courriel. Aucun mot de passe n’est requis."
          : "Entre le code reçu par courriel pour ouvrir ton espace."}
      </p>
      {step === "EMAIL" ? (
        <form className="fe-form" onSubmit={requestOtp} aria-busy={busy}>
          <label className="fe-field">
            Courriel
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          {error ? <Feedback>{error}</Feedback> : null}
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="submit"
            disabled={busy}
          >
            {busy ? "Envoi…" : "Envoyer mon code"}
          </button>
        </form>
      ) : (
        <form
          className="fe-form"
          onSubmit={verifyOtp}
          aria-busy={busy || step === "VERIFYING"}
        >
          <Feedback tone="info">
            {resent
              ? "Si ce compte est actif, un nouveau code a été envoyé."
              : "Si ce compte est actif, le code a été envoyé."}
          </Feedback>
          <CodeInput
            value={otp}
            onChange={setOtp}
            autoFocus
            disabled={busy || step === "VERIFYING"}
            invalid={Boolean(error)}
          />
          {error ? <Feedback>{error}</Feedback> : null}
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="submit"
            disabled={busy || step === "VERIFYING" || !/^\d{6}$/.test(otp)}
          >
            {step === "VERIFYING" ? "Connexion…" : "Ouvrir mon portail"}
          </button>
          <button
            className="fe-text-button"
            type="button"
            onClick={() => void requestOtp()}
            disabled={busy || step === "VERIFYING"}
          >
            {busy ? "Envoi…" : "Renvoyer le code"}
          </button>
          <button
            className="fe-text-button"
            type="button"
            disabled={busy || step === "VERIFYING"}
            onClick={() => {
              setStep("EMAIL");
              setOtp("");
              setError(null);
              setResent(false);
            }}
          >
            Changer de courriel
          </button>
        </form>
      )}
      <p className="fe-auth-secondary">
        Tu es coach ? <Link href="/login">Accéder à mon espace Coach</Link>
      </p>
    </AuthShell>
  );
}
