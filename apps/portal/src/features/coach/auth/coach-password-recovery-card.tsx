"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/fe/auth-shell";
import { Feedback } from "@/components/fe/feedback";

export function CoachPasswordRecoveryCard() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/coach-password/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Réessaie dans quelques instants.");
      }
      setAccepted(true);
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

  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach</p>
      <h1 className="fe-title">Définir mon mot de passe.</h1>
      <p className="fe-intro">
        Reçois un lien sécurisé pour choisir un nouveau mot de passe.
      </p>
      {accepted ? (
        <Feedback tone="success">
          Si ce compte est autorisé, un lien sécurisé vient d’être envoyé.
        </Feedback>
      ) : (
        <form className="fe-form" onSubmit={submit} aria-busy={busy}>
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
            {busy ? "Envoi…" : "Envoyer le lien sécurisé"}
          </button>
        </form>
      )}
      <p className="fe-auth-secondary">
        <Link href="/login">Retour à la connexion Coach</Link>
      </p>
    </AuthShell>
  );
}
