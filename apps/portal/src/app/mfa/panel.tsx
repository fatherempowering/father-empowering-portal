"use client";

import { useState, type FormEvent } from "react";
import { CodeInput } from "@/components/fe/code-input";
import { Feedback } from "@/components/fe/feedback";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaPanel({
  verifiedFactorId,
}: {
  verifiedFactorId: string | null;
}) {
  const [factorId, setFactorId] = useState(verifiedFactorId);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enroll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/mfa/enroll", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error("Impossible de préparer la vérification. Réessaie.");
      setEnrollment(body.data);
      setFactorId(body.data.factorId);
    } catch {
      setError(
        "Impossible de préparer la vérification. Vérifie ta connexion et réessaie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!factorId || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, code }),
      });
      if (!response.ok) {
        setError(
          "Le code est invalide ou expiré. Entre le code actuel de ton application.",
        );
        return;
      }
      window.location.assign("/coach");
    } catch {
      setError(
        "La connexion a été interrompue. Vérifie ton réseau et réessaie.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      {!factorId ? (
        <button
          className="fe-button fe-button-primary fe-button-wide"
          type="button"
          onClick={enroll}
          disabled={busy}
        >
          {busy ? "Préparation…" : "Configurer la vérification"}
        </button>
      ) : null}
      {enrollment ? (
        <div className="fe-mfa-enrollment">
          <p className="fe-intro">
            Scanne ce code QR avec ton application d’authentification, puis
            entre le code qu’elle affiche.
          </p>
          {/* The existing Supabase enrollment contract supplies a self-contained QR data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qrCode}
            alt="Code QR pour l’application d’authentification"
          />
          <details>
            <summary>Entrer la clé manuellement</summary>
            <code>{enrollment.secret}</code>
          </details>
        </div>
      ) : null}
      {factorId ? (
        <form onSubmit={verify} className="fe-form" aria-busy={busy}>
          <CodeInput
            value={code}
            onChange={setCode}
            disabled={busy}
            autoFocus
            invalid={Boolean(error)}
            name="code"
          />
          {error ? <Feedback>{error}</Feedback> : null}
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="submit"
            disabled={busy || !/^\d{6}$/.test(code)}
          >
            {busy ? "Vérification…" : "Vérifier et continuer"}
          </button>
        </form>
      ) : error ? (
        <Feedback>{error}</Feedback>
      ) : null}
    </section>
  );
}
