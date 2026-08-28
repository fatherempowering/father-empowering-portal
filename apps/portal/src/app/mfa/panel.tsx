"use client";

import { useState } from "react";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaPanel({ verifiedFactorId }: { verifiedFactorId: string | null }) {
  const [factorId, setFactorId] = useState(verifiedFactorId);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enroll() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/mfa/enroll", { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError("Impossible de préparer le MFA.");
    setEnrollment(body.data);
    setFactorId(body.data.factorId);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId, code }),
    });
    setBusy(false);
    if (!response.ok) return setError("Le code est invalide ou expiré.");
    window.location.assign("/coach");
  }

  return (
    <section>
      {!factorId ? (
        <button type="button" onClick={enroll} disabled={busy}>
          Activer le MFA
        </button>
      ) : null}
      {enrollment ? (
        <div>
          {/* Supabase returns a self-contained QR data URI; no remote image is loaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="Code QR pour l’application d’authentification" />
          <p>Clé manuelle : <code>{enrollment.secret}</code></p>
        </div>
      ) : null}
      {factorId ? (
        <form onSubmit={verify} style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <label>
            Code à 6 chiffres
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy || code.length !== 6}>Vérifier</button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
