"use client";

import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/fe/auth-shell";
import { Feedback } from "@/components/fe/feedback";

export function CoachPasswordUpdateCard() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/coach-password/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { redirectTo?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Le lien est invalide ou expiré.",
        );
      }
      window.location.replace(body.data?.redirectTo ?? "/login");
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Réessaie dans quelques instants.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach</p>
      <h1 className="fe-title">Choisis ton mot de passe.</h1>
      <p className="fe-intro">
        Utilise au moins 12 caractères. Toutes tes autres sessions seront
        fermées après la mise à jour.
      </p>
      <form className="fe-form" onSubmit={submit} aria-busy={busy}>
        <label className="fe-field">
          Nouveau mot de passe
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="fe-field">
          Confirmer le mot de passe
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
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
          {busy ? "Mise à jour…" : "Enregistrer mon mot de passe"}
        </button>
      </form>
    </AuthShell>
  );
}
