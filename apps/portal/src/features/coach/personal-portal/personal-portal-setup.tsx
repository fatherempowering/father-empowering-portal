"use client";

import { useRef, useState, type FormEvent } from "react";

import { Feedback } from "@/components/fe/feedback";
import { TimezoneField } from "@/components/fe/timezone-field";

type SetupValues = Readonly<{
  firstName: string;
  lastName: string;
  locale: "fr-CA" | "en-CA";
  timeZone: string;
}>;

type SetupCommand = Readonly<{
  fingerprint: string;
  idempotencyKey: string;
}>;

const DEFAULT_TIMEOUT_MS = 10_000;

export type PersonalPortalSetupProps = Readonly<{
  initialFirstName?: string;
  initialLastName?: string;
  initialLocale?: "fr-CA" | "en-CA";
  initialTimeZone?: string;
  requestTimeoutMs?: number;
}>;

export function PersonalPortalSetup({
  initialFirstName = "",
  initialLastName = "",
  initialLocale = "fr-CA",
  initialTimeZone = "America/Montreal",
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
}: PersonalPortalSetupProps) {
  const [values, setValues] = useState<SetupValues>({
    firstName: initialFirstName,
    lastName: initialLastName,
    locale: initialLocale,
    timeZone: initialTimeZone,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const command = useRef<SetupCommand | null>(null);
  const inFlight = useRef(false);

  function update(next: Partial<SetupValues>) {
    setValues((current) => ({ ...current, ...next }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const intent = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      locale: values.locale,
      timeZone: values.timeZone.trim(),
    };
    const fingerprint = JSON.stringify(intent);
    if (command.current?.fingerprint !== fingerprint) {
      command.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    }

    inFlight.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      Math.max(1, requestTimeoutMs),
    );

    try {
      const response = await fetch("/api/v1/coach/personal-client", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          ...intent,
          idempotencyKey: command.current.idempotencyKey,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { clientId?: unknown; redirectTo?: unknown };
      };

      if (
        response.ok
        && typeof payload.data?.clientId === "string"
        && payload.data.clientId.length > 0
        && payload.data.redirectTo === "/client"
      ) {
        window.location.replace("/client");
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setError("Ta session Coach n’est plus valide. Reconnecte-toi, puis réessaie.");
      } else if (response.status === 400 || response.status === 413) {
        setError("Vérifie les renseignements du formulaire, puis réessaie.");
      } else {
        setError("Ton portail personnel n’a pas pu être activé. Réessaie dans quelques instants.");
      }
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "L’activation prend trop de temps. Vérifie ta connexion, puis réessaie."
          : "Impossible de joindre le service. Vérifie ta connexion, puis réessaie.",
      );
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <header className="fe-page-heading">
        <div>
          <p className="fe-kicker">Espace Coach</p>
          <h1 className="fe-title">Mon portail personnel</h1>
          <p className="fe-intro">
            Active un nouveau profil Client lié à ton compte Coach pour suivre ton
            propre parcours dans le portail.
          </p>
        </div>
      </header>
      <section className="fe-panel" aria-labelledby="personal-portal-setup-title">
        <header className="fe-panel-header">
          <div>
            <h2 id="personal-portal-setup-title">Créer mon profil personnel</h2>
            <p>Ton ancien Client test demeure intact et séparé.</p>
          </div>
        </header>
        <form
          className="fe-form fe-dialog-content"
          aria-busy={busy}
          onSubmit={(event) => void submit(event)}
        >
          <p className="fe-form-summary">
            Cette activation crée seulement ton nouveau profil personnel. Elle
            n’envoie aucune invitation et ne demande aucun code supplémentaire.
          </p>
          <div className="fe-two-fields">
            <label className="fe-field">
              Prénom
              <input
                autoComplete="given-name"
                disabled={busy}
                maxLength={120}
                name="firstName"
                required
                value={values.firstName}
                onChange={(event) => update({ firstName: event.target.value })}
              />
            </label>
            <label className="fe-field">
              Nom
              <input
                autoComplete="family-name"
                disabled={busy}
                maxLength={120}
                name="lastName"
                required
                value={values.lastName}
                onChange={(event) => update({ lastName: event.target.value })}
              />
            </label>
          </div>
          <label className="fe-field">
            Langue du portail personnel
            <select
              disabled={busy}
              name="locale"
              value={values.locale}
              onChange={(event) => update({
                locale: event.target.value as SetupValues["locale"],
              })}
            >
              <option value="fr-CA">Français</option>
              <option value="en-CA">English</option>
            </select>
          </label>
          <TimezoneField
            disabled={busy}
            value={values.timeZone}
            onChange={(timeZone) => update({ timeZone })}
          />
          {error ? <Feedback>{error}</Feedback> : null}
          <div className="fe-form-actions">
            <button
              className="fe-button fe-button-primary"
              disabled={busy}
              type="submit"
            >
              {busy ? "Activation…" : "Activer mon portail personnel"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
