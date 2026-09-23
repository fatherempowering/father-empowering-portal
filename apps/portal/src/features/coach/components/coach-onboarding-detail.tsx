"use client";

import { useCallback, useEffect, useState } from "react";

import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import {
  parseCoachOnboardingApiEnvelope,
  type CoachOnboardingApiEnvelope,
  type CoachOnboardingDetailValue,
} from "./coach-onboarding-detail-contract";
import {
  onboardingPresentationSections,
  type OnboardingPresentationSection,
} from "./onboarding-presentation";
import { formatAssessmentDate } from "./initial-assessment-presentation";
import styles from "./coach-client-detail.module.css";

const LOAD_TIMEOUT_MS = 8_000;

class SafeLoadError extends Error {}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; value: CoachOnboardingDetailValue }
  | { kind: "error"; message: string };

async function readEnvelope(
  response: Response,
  clientId: string,
): Promise<CoachOnboardingApiEnvelope> {
  return parseCoachOnboardingApiEnvelope(
    await response.json().catch(() => null),
    clientId,
  );
}

export function CoachOnboardingDetail({ clientId }: { clientId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

    async function load() {
      try {
        const response = await fetch(
          `/api/v1/coach/clients/${encodeURIComponent(clientId)}/onboarding`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const body = await readEnvelope(response, clientId);

        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (response.status === 403 && body.error?.code === "FORBIDDEN") {
          window.location.replace("/verify-email");
          return;
        }
        if (!response.ok) {
          throw new SafeLoadError(
            response.status === 404
              ? "Le questionnaire d’accueil n’est pas disponible pour ce client."
              : "Impossible de charger le questionnaire d’accueil.",
          );
        }
        if (!body.data) {
          throw new SafeLoadError(
            "La réponse reçue est invalide. Réessaie pour recharger le questionnaire.",
          );
        }
        if (mounted) setState({ kind: "ready", value: body.data });
      } catch (error) {
        if (!mounted) return;
        const safeMessage =
          error instanceof SafeLoadError
            ? error.message
            : "Impossible de charger le questionnaire. Vérifie ta connexion et réessaie.";
        setState({ kind: "error", message: safeMessage });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, clientId]);

  return (
    <section
      className={styles.assessment}
      aria-labelledby="coach-onboarding-title"
      aria-busy={state.kind === "loading"}
      data-testid="coach-onboarding-detail"
    >
      <OnboardingHeader state={state} />
      {state.kind === "loading" ? (
        <div className={styles.empty}>
          <Loading>Chargement du questionnaire d’accueil…</Loading>
        </div>
      ) : state.kind === "error" ? (
        <div className={styles.empty}>
          <Feedback>{state.message}</Feedback>
          <button className="fe-button" type="button" onClick={retry}>
            Réessayer
          </button>
        </div>
      ) : (
        <OnboardingContent value={state.value} onRetry={retry} />
      )}
    </section>
  );
}

function OnboardingHeader({ state }: { state: LoadState }) {
  const submitted =
    state.kind === "ready" && state.value.intake.status === "SUBMITTED";
  const label =
    state.kind === "loading"
      ? "Chargement…"
      : state.kind === "error"
        ? "Indisponible"
        : submitted
          ? "Questionnaire d’accueil transmis"
          : "Non transmis";

  return (
    <header className={styles.assessmentHeader}>
      <div>
        <p className="fe-kicker">Accueil Client</p>
        <h2 id="coach-onboarding-title">Questionnaire d’accueil</h2>
        <p>Les réponses transmises par le client, en lecture seule.</p>
      </div>
      <span
        className={`fe-badge ${submitted ? "fe-badge-active" : ""}`}
        data-testid="coach-onboarding-status"
      >
        <Icon
          name={submitted ? "check" : state.kind === "error" ? "alert" : "clock"}
        />
        {label}
      </span>
    </header>
  );
}

function OnboardingContent({
  value,
  onRetry,
}: {
  value: CoachOnboardingDetailValue;
  onRetry: () => void;
}) {
  const { client, intake } = value;
  if (intake.status !== "SUBMITTED") {
    return (
      <div className={styles.empty}>
        <h3>Aucun questionnaire d’accueil transmis</h3>
        <p>
          Un brouillon peut exister, mais aucune réponse n’est visible ici tant
          que le client ne l’a pas transmise.
        </p>
      </div>
    );
  }

  if (intake.responses === null) {
    return (
      <div className={styles.empty}>
        <Feedback>
          Le questionnaire est marqué comme transmis, mais ses réponses ne sont
          pas disponibles. Réessaie pour actualiser le dossier.
        </Feedback>
        <button className="fe-button" type="button" onClick={onRetry}>
          Réessayer
        </button>
      </div>
    );
  }

  const submittedAt = formatAssessmentDate(
    intake.submittedAt,
    client.timezone,
  );
  const sections = onboardingPresentationSections(intake.responses, "fr");

  return (
    <>
      <div className={styles.empty}>
        <p>
          {submittedAt
            ? `Transmis le ${submittedAt}.`
            : "Le questionnaire d’accueil a été transmis."}{" "}
          Les réponses sont en lecture seule et restent distinctes de l’identité
          du compte et du bilan initial.
        </p>
      </div>
      <div className={styles.onboardingSections}>
        {sections.map((section) => (
          <OnboardingSection key={section.id} section={section} />
        ))}
      </div>
    </>
  );
}

function OnboardingSection({
  section,
}: {
  section: OnboardingPresentationSection;
}) {
  return (
    <section
      className={styles.onboardingSection}
      data-testid={`onboarding-section-${section.id}`}
    >
      <h3>{section.title}</h3>
      <p className={styles.onboardingSectionIntro}>{section.description}</p>
      <dl className={styles.onboardingValues}>
        {section.items.map((item) => (
          <div
            className={`${styles.onboardingValue} ${item.wide ? styles.onboardingValueWide : ""}`}
            data-testid={`onboarding-answer-${item.key}`}
            key={item.key}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
