"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { PublicInvitation } from "./contracts";
import Link from "next/link";
import { AuthShell } from "@/components/fe/auth-shell";
import { CodeInput } from "@/components/fe/code-input";
import { Feedback, Loading } from "@/components/fe/feedback";

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
  network: string;
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
    network: "Connexion interrompue. Vérifie ton accès Internet et réessaie.",
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
    network:
      "Connection interrupted. Check your Internet connection and try again.",
  },
};

export function ClientActivationCard() {
  const [step, setStep] = useState<Step>("LOADING");
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const locale = invitation?.locale === "en-CA" ? "en" : "fr";
  const copy = COPY[locale];

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token") ?? "";
    // Erase the bearer secret immediately after capturing it in this page's
    // memory. It is never placed in localStorage or URL history and is sent
    // only in same-origin, no-store POST bodies required by activation.
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
          setMessage(
            error instanceof TypeError
              ? COPY.fr.network
              : error instanceof Error
                ? error.message
                : null,
          );
          setStep("ERROR");
        }
      }
    }

    void inspect();
    return () => controller.abort();
  }, [invitationToken]);

  async function requestOtp() {
    if (!invitationToken || sending || step === "ACTIVATING") return;
    setMessage(null);
    setSending(true);
    try {
      const response = await fetch("/api/v1/client/activation/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationToken }),
      });
      const payload = await readPayload(response);
      setInvitation(requireInvitation(payload));
      setOtp("");
      setStep("CODE_SENT");
    } catch (error) {
      setMessage(
        error instanceof TypeError
          ? copy.network
          : error instanceof Error
            ? error.message
            : copy.invalid,
      );
      setStep("ERROR");
    } finally {
      setSending(false);
    }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !invitationToken ||
      sending ||
      step === "ACTIVATING" ||
      !/^\d{6}$/.test(otp)
    )
      return;
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
      setMessage(
        error instanceof TypeError
          ? copy.network
          : error instanceof Error
            ? error.message
            : copy.invalid,
      );
      setStep("CODE_SENT");
    }
  }

  return (
    <AuthShell locale={locale}>
      <p className="fe-kicker">The Legacy Protocol</p>
      <h1 className="fe-title" id="activation-title">
        {copy.title}.
      </h1>
      {step === "LOADING" ? (
        <Loading>
          {locale === "fr"
            ? "Vérification de l’invitation…"
            : "Checking your invitation…"}
        </Loading>
      ) : null}
      {step === "READY" && invitation ? (
        <>
          <p className="fe-intro">
            {copy.intro} <strong>{invitation.emailHint}</strong>.
          </p>
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="button"
            onClick={() => void requestOtp()}
            disabled={sending}
          >
            {sending ? (locale === "fr" ? "Envoi…" : "Sending…") : copy.send}
          </button>
        </>
      ) : null}
      {(step === "CODE_SENT" || step === "ACTIVATING") && invitation ? (
        <form
          onSubmit={activate}
          className="fe-form"
          aria-busy={sending || step === "ACTIVATING"}
        >
          <p className="fe-intro">
            {copy.codeHint}
            <br />
            <strong>{invitation.emailHint}</strong>
          </p>
          <Feedback tone="success">{copy.sent}</Feedback>
          <CodeInput
            value={otp}
            onChange={setOtp}
            autoFocus
            disabled={sending || step === "ACTIVATING"}
            invalid={Boolean(message)}
            label={copy.codeLabel}
            locale={locale}
          />
          {message ? <Feedback>{message}</Feedback> : null}
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="submit"
            disabled={sending || step === "ACTIVATING" || !/^\d{6}$/.test(otp)}
          >
            {step === "ACTIVATING" ? copy.working : copy.activate}
          </button>
          <div className="fe-auth-secondary">
            <p>
              {locale === "fr"
                ? "Pas de code dans tes courriels ?"
                : "No code in your inbox?"}
            </p>
            <button
              className="fe-text-button"
              type="button"
              onClick={() => void requestOtp()}
              disabled={sending || step === "ACTIVATING"}
            >
              {locale === "fr"
                ? sending
                  ? "Envoi…"
                  : "Renvoyer le code"
                : sending
                  ? "Sending…"
                  : "Resend code"}
            </button>
          </div>
        </form>
      ) : null}
      {step === "ERROR" ? (
        <div className="fe-form">
          <Feedback>{message ?? copy.invalid}</Feedback>
          {invitationToken ? (
            <button
              className="fe-button fe-button-wide"
              type="button"
              onClick={() => void requestOtp()}
              disabled={sending}
            >
              {sending ? (locale === "fr" ? "Envoi…" : "Sending…") : copy.retry}
            </button>
          ) : null}
          <p className="fe-hint">
            {locale === "fr"
              ? "Si ton lien ne fonctionne plus, demande une nouvelle invitation à ton coach."
              : "If your link no longer works, ask your coach for a new invitation."}
          </p>
          <Link className="fe-text-button" href="/client-login">
            {locale === "fr"
              ? "Mon portail est déjà activé"
              : "My portal is already active"}
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}

type ActivationPayload = {
  invitation?: PublicInvitation;
  redirectTo?: string;
  error?: { message?: string };
};

async function readPayload(response: Response): Promise<ActivationPayload> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as ActivationPayload;
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
