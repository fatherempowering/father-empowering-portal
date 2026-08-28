"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { PublicInvitation } from "./contracts";
import styles from "./client-activation.module.css";

type Step = "LOADING" | "READY" | "CODE_SENT" | "ACTIVATING" | "ERROR";

type Copy = Readonly<{
  eyebrow: string;
  title: string;
  intro: string;
  send: string;
  sent: string;
  codeLabel: string;
  codeHint: string;
  activate: string;
  working: string;
  invalid: string;
  retry: string;
}>;

const COPY: Record<"fr" | "en", Copy> = {
  fr: {
    eyebrow: "LEGACY PROTOCOL",
    title: "Active ton portail",
    intro: "Un code de connexion sera envoyé à",
    send: "Envoyer mon code",
    sent: "Code envoyé",
    codeLabel: "Code à 6 chiffres",
    codeHint: "Consulte ta boîte de réception, puis entre le code reçu.",
    activate: "Activer mon portail",
    working: "Activation…",
    invalid: "Cette invitation est invalide, expirée ou déjà utilisée.",
    retry: "Réessayer",
  },
  en: {
    eyebrow: "LEGACY PROTOCOL",
    title: "Activate your portal",
    intro: "A sign-in code will be sent to",
    send: "Send my code",
    sent: "Code sent",
    codeLabel: "6-digit code",
    codeHint: "Check your inbox, then enter the code you received.",
    activate: "Activate my portal",
    working: "Activating…",
    invalid: "This invitation is invalid, expired, or has already been used.",
    retry: "Try again",
  },
};

export function ClientActivationCard() {
  const [step, setStep] = useState<Step>("LOADING");
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const locale = invitation?.locale === "en-CA" ? "en" : "fr";
  const copy = COPY[locale];

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token") ?? "";
    // Erase the bearer secret immediately after capturing it in this page's
    // memory. It is never placed in localStorage, history or an HTTP request.
    window.history.replaceState(null, "", "/activate");
    setInvitationToken(token);
  }, []);

  useEffect(() => {
    if (invitationToken === null) return;
    const controller = new AbortController();

    async function inspect() {
      if (!invitationToken) {
        setStep("ERROR");
        return;
      }

      try {
        const response = await fetch("/api/v1/client/activation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invitationToken }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readPayload(response);
        setInvitation(requireInvitation(payload));
        setStep("READY");
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : null);
          setStep("ERROR");
        }
      }
    }

    void inspect();
    return () => controller.abort();
  }, [invitationToken]);

  async function requestOtp() {
    if (!invitationToken) return;
    setMessage(null);
    try {
      const response = await fetch("/api/v1/client/activation/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationToken }),
      });
      const payload = await readPayload(response);
      setInvitation(requireInvitation(payload));
      setStep("CODE_SENT");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.invalid);
      setStep("ERROR");
    }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitationToken) return;
    setMessage(null);
    setStep("ACTIVATING");

    try {
      const response = await fetch("/api/v1/client/activation/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationToken, otp }),
      });
      const payload = await readPayload(response);
      window.location.replace(payload.redirectTo ?? "/client");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.invalid);
      setStep("CODE_SENT");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="activation-title">
        <div className={styles.mark} aria-hidden="true">FE</div>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 id="activation-title">{copy.title}</h1>

        {step === "LOADING" ? (
          <div className={styles.loading} role="status" aria-label="Loading invitation" />
        ) : null}

        {step === "READY" && invitation ? (
          <>
            <p className={styles.intro}>
              {copy.intro} <strong>{invitation.emailHint}</strong>.
            </p>
            <button className={styles.primary} type="button" onClick={() => void requestOtp()}>
              {copy.send}
            </button>
          </>
        ) : null}

        {(step === "CODE_SENT" || step === "ACTIVATING") && invitation ? (
          <form onSubmit={activate} className={styles.form}>
            <p className={styles.success} role="status">{copy.sent}</p>
            <p className={styles.intro}>
              {copy.codeHint} <strong>{invitation.emailHint}</strong>
            </p>
            <label htmlFor="activation-otp">{copy.codeLabel}</label>
            <input
              id="activation-otp"
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
              disabled={step === "ACTIVATING"}
            />
            {message ? <p className={styles.error} role="alert">{message}</p> : null}
            <button className={styles.primary} type="submit" disabled={step === "ACTIVATING"}>
              {step === "ACTIVATING" ? copy.working : copy.activate}
            </button>
            <button className={styles.secondary} type="button" onClick={() => void requestOtp()}>
              {copy.send}
            </button>
          </form>
        ) : null}

        {step === "ERROR" ? (
          <div className={styles.form}>
            <p className={styles.error} role="alert">{message ?? copy.invalid}</p>
            {invitationToken ? (
              <button className={styles.secondary} type="button" onClick={() => void requestOtp()}>
                {copy.retry}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

type ActivationPayload = {
  invitation?: PublicInvitation;
  redirectTo?: string;
  error?: { message?: string };
};

async function readPayload(response: Response): Promise<ActivationPayload> {
  const payload = (await response.json().catch(() => ({}))) as ActivationPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Please try again.");
  }
  return payload;
}

function requireInvitation(payload: ActivationPayload): PublicInvitation {
  if (!payload.invitation) {
    throw new Error("Please try again.");
  }
  return payload.invitation;
}
