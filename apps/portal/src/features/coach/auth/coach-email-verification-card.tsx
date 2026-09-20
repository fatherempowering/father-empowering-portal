"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/fe/auth-shell";
import { CodeInput } from "@/components/fe/code-input";
import { Feedback } from "@/components/fe/feedback";
import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";

type RequestState = "SENDING" | "SENT" | "ERROR";

type ApiError = Readonly<{
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}>;

type RequestResponse = Readonly<{
  accepted: true;
  emailHint: string;
  retryAfterSeconds: number;
}>;

type VerifyResponse = Readonly<{
  verified: true;
  redirectTo: "/coach";
}>;

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class CoachAuthRequestTimeoutError extends Error {
  constructor() {
    super("Coach authentication request timed out");
    this.name = "CoachAuthRequestTimeoutError";
  }
}

export async function fetchCoachAuthWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new CoachAuthRequestTimeoutError());
      controller.abort();
    }, Math.max(1, timeoutMs));
  });

  try {
    return await Promise.race([
      transport(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

function safeSeconds(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? Math.max(0, Math.ceil(parsed))
    : 0;
}

async function readEnvelope<T>(response: Response): Promise<{
  data?: T;
  error?: ApiError;
}> {
  return (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: ApiError;
  };
}

export function CoachEmailVerificationCard({
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: {
  requestTimeoutMs?: number;
} = {}) {
  const [requestState, setRequestState] = useState<RequestState>("SENDING");
  const [emailHint, setEmailHint] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const automaticRequestStarted = useRef(false);
  const requestAbortController = useRef<AbortController | null>(null);
  const verificationForm = useRef<HTMLFormElement>(null);

  const requestCode = useCallback(async (resent: boolean) => {
    requestAbortController.current?.abort();
    const requestController = new AbortController();
    requestAbortController.current = requestController;
    setRequestState("SENDING");
    setDeliveryNotice(null);
    setError(null);

    try {
      const response = await fetchCoachAuthWithTimeout(
        "/api/v1/auth/coach-email-otp/request",
        {
          method: "POST",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: requestController.signal,
        },
        requestTimeoutMs,
      );
      const payload = await readEnvelope<RequestResponse>(response);
      const retryAfter = safeSeconds(
        payload.data?.retryAfterSeconds ??
          payload.error?.retryAfterSeconds ??
          response.headers.get("Retry-After"),
      );

      if (!response.ok || !payload.data?.accepted || !payload.data.emailHint) {
        setCooldown(retryAfter);
        if (response.status === 401) {
          setError(
            "Ta connexion a expiré. Reconnecte-toi pour recevoir un nouveau code.",
          );
        } else if (response.status === 429) {
          setError(
            retryAfter > 0
              ? `Tu viens de demander un code. Tu pourras en recevoir un autre dans ${retryAfter} secondes.`
              : "Tu viens de demander un code. Attends un moment, puis réessaie.",
          );
        } else {
          setError(
            "Nous n’avons pas pu envoyer le code. Réessaie dans quelques instants.",
          );
        }
        setRequestState(emailHint ? "SENT" : "ERROR");
        return;
      }

      setEmailHint(payload.data.emailHint);
      setCooldown(safeSeconds(payload.data.retryAfterSeconds));
      setCode("");
      setDeliveryNotice(
        resent
          ? `Nouveau code envoyé à ${payload.data.emailHint}.`
          : `Code envoyé à ${payload.data.emailHint}.`,
      );
      setRequestState("SENT");
    } catch {
      if (requestController.signal.aborted) return;
      setError(
        "Nous n’avons pas pu envoyer le code. Vérifie ta connexion Internet et réessaie.",
      );
      setRequestState(emailHint ? "SENT" : "ERROR");
    } finally {
      if (requestAbortController.current === requestController) {
        requestAbortController.current = null;
      }
    }
  }, [emailHint, requestTimeoutMs]);

  useEffect(() => {
    if (automaticRequestStarted.current) return;
    automaticRequestStarted.current = true;
    void requestCode(false);
  }, [requestCode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifying || requestState !== "SENT" || !/^\d{6}$/.test(code)) return;

    setVerifying(true);
    setError(null);
    try {
      const response = await fetchCoachAuthWithTimeout(
        "/api/v1/auth/coach-email-otp/verify",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        },
        requestTimeoutMs,
      );
      const payload = await readEnvelope<VerifyResponse>(response);

      if (!response.ok || !payload.data?.verified) {
        if (response.status === 401) {
          setError(
            "Ce code est invalide ou expiré. Utilise le courriel le plus récent, puis réessaie.",
          );
        } else if (response.status === 429) {
          setError(
            "Trop de tentatives. Attends quelques minutes, puis demande un nouveau code.",
          );
        } else {
          setError("Impossible de vérifier le code. Réessaie dans quelques instants.");
        }
        setCode("");
        window.requestAnimationFrame(() => {
          verificationForm.current?.querySelector("input")?.focus();
        });
        return;
      }

      window.location.replace(payload.data.redirectTo ?? "/coach");
    } catch {
      setError(
        "Impossible de vérifier le code. Vérifie ta connexion Internet et réessaie.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function changeAccount() {
    if (changingAccount || verifying) return;
    requestAbortController.current?.abort();
    setChangingAccount(true);
    setError(null);
    const signedOut = await requestCoachLogout(
      () => {
        window.location.replace("/login");
      },
      (input, init) =>
        fetchCoachAuthWithTimeout(input, init, requestTimeoutMs),
    );
    if (signedOut) return;
    setError("Impossible de changer de compte. Réessaie.");
    setRequestState(emailHint ? "SENT" : "ERROR");
    setChangingAccount(false);
  }

  const resendDisabled =
    requestState === "SENDING" || verifying || changingAccount || cooldown > 0;

  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach · Vérification</p>
      <h1 className="fe-title">
        {requestState === "SENDING"
          ? "Envoi du code…"
          : requestState === "ERROR" && !emailHint
            ? "Le code n’a pas pu être envoyé."
            : "Entre le code reçu par courriel."}
      </h1>
      <p className="fe-intro">
        {requestState === "SENDING" ? (
          emailHint ? (
            <>
              Nous envoyons un nouveau code à <strong>{emailHint}</strong>.
            </>
          ) : (
            "Nous envoyons automatiquement un code à 6 chiffres à ton adresse courriel."
          )
        ) : emailHint ? (
          <>
            Nous avons envoyé un code à 6 chiffres à <strong>{emailHint}</strong>.
          </>
        ) : (
          "Réessaie l’envoi pour recevoir un code à 6 chiffres par courriel."
        )}
      </p>
      <p className="fe-hint">
        Cette vérification protège l’accès aux dossiers de tes clients.
      </p>

      {requestState === "SENT" ? (
        <form
          ref={verificationForm}
          className="fe-form"
          onSubmit={verifyCode}
          aria-busy={verifying}
        >
          {deliveryNotice ? <Feedback tone="success">{deliveryNotice}</Feedback> : null}
          <p className="fe-hint">
            Utilise le courriel le plus récent. Le code expire dans 10 minutes.
          </p>
          <CodeInput
            value={code}
            onChange={setCode}
            disabled={verifying || changingAccount}
            autoFocus
            invalid={Boolean(error)}
            label="Code à 6 chiffres"
            name="code"
          />
          {error ? <Feedback>{error}</Feedback> : null}
          <button
            className="fe-button fe-button-primary fe-button-wide"
            type="submit"
            disabled={verifying || changingAccount || !/^\d{6}$/.test(code)}
          >
            {verifying ? "Vérification…" : "Ouvrir mon espace Coach"}
          </button>
        </form>
      ) : error ? (
        <Feedback>{error}</Feedback>
      ) : (
        <p className="fe-loading" role="status">
          <span className="fe-spinner" aria-hidden="true" />
          Envoi du code…
        </p>
      )}

      <div className="fe-form">
        <button
          className="fe-text-button"
          type="button"
          onClick={() => void requestCode(true)}
          disabled={resendDisabled}
        >
          {requestState === "SENDING"
            ? "Envoi…"
            : cooldown > 0
              ? `Renvoyer dans ${cooldown} s`
              : "Renvoyer le code"}
        </button>
        <button
          className="fe-text-button"
          type="button"
          onClick={() => void changeAccount()}
          disabled={changingAccount || verifying}
        >
          {changingAccount ? "Changement de compte…" : "Se connecter avec une autre adresse"}
        </button>
      </div>
    </AuthShell>
  );
}
