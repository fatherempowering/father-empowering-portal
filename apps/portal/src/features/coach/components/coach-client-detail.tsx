"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";
import {
  parseCoachClientApiEnvelope,
  type CoachClientApiEnvelope,
  type CoachClientWeekZero,
} from "./coach-client-detail-contract";
import {
  assessmentSections,
  formatAssessmentDate,
} from "./initial-assessment-presentation";
import styles from "./coach-client-detail.module.css";

const LOAD_TIMEOUT_MS = 8_000;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; value: CoachClientWeekZero }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

async function readEnvelope(
  response: Response,
): Promise<CoachClientApiEnvelope> {
  return parseCoachClientApiEnvelope(
    await response.json().catch(() => null),
  );
}

export function CoachClientDetail({ clientId }: { clientId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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
          `/api/v1/coach/clients/${encodeURIComponent(clientId)}/week-zero`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const body = await readEnvelope(response);
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (response.status === 403 && body.error?.code === "FORBIDDEN") {
          window.location.replace("/verify-email");
          return;
        }
        if (response.status === 404) {
          if (mounted) setState({ kind: "not-found" });
          return;
        }
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "Impossible de charger ce dossier.",
          );
        }
        if (!body.data) {
          throw new Error(
            "La réponse reçue est invalide. Réessaie pour recharger le dossier.",
          );
        }
        if (mounted) setState({ kind: "ready", value: body.data });
      } catch (error) {
        if (!mounted) return;
        setState({
          kind: "error",
          message:
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : "Impossible de charger ce dossier. Vérifie ta connexion et réessaie.",
        });
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

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const responseReceived = await requestCoachLogout(() => {
      window.location.replace("/login");
    });
    if (responseReceived) return;
    setSignOutError("Impossible de te déconnecter. Réessaie.");
    setSigningOut(false);
  }

  return (
    <AppShell space="coach" current="clients">
      <div className={styles.page} data-testid="coach-client-detail">
        <div className={styles.headingActions}>
          <Link className="fe-button" href="/coach">
            Retour aux clients
          </Link>
          <button
            className="fe-button"
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
        {signOutError ? <Feedback>{signOutError}</Feedback> : null}
        {state.kind === "loading" ? (
          <Loading>Chargement du dossier client…</Loading>
        ) : state.kind === "not-found" ? (
          <section className={styles.assessment}>
            <div className={styles.empty}>
              <h1 className="fe-title">Dossier inaccessible</h1>
              <p>
                Ce client est introuvable ou ne fait pas partie de tes clients
                assignés.
              </p>
            </div>
          </section>
        ) : state.kind === "error" ? (
          <>
            <h1 className="fe-title">Dossier temporairement indisponible</h1>
            <Feedback>{state.message}</Feedback>
            <button className="fe-button" type="button" onClick={retry}>
              Réessayer
            </button>
          </>
        ) : (
          <ClientAssessment value={state.value} />
        )}
      </div>
    </AppShell>
  );
}

function ClientAssessment({ value }: { value: CoachClientWeekZero }) {
  const { client, assessment } = value;
  const submitted = assessment.status === "SUBMITTED";
  const submittedAt = formatAssessmentDate(
    assessment.submittedAt,
    client.timezone,
  );

  return (
    <>
      <header className={styles.heading}>
        <div>
          <p className="fe-kicker">Dossier client</p>
          <h1 className="fe-title">{client.displayName}</h1>
          <p className={styles.identity}>{client.email}</p>
        </div>
      </header>
      <section
        className={styles.assessment}
        aria-labelledby="initial-assessment-title"
      >
        <header className={styles.assessmentHeader}>
          <div>
            <p className="fe-kicker">Week Zero</p>
            <h2 id="initial-assessment-title">Bilan initial</h2>
            <p>
              Mesures, mobilité et disponibilités transmises par le client.
            </p>
          </div>
          <span
            className={`fe-badge ${submitted ? "fe-badge-active" : ""}`}
            data-testid="initial-assessment-status"
          >
            <Icon name={submitted ? "check" : "clock"} />
            {submitted ? "Bilan initial transmis" : "Non transmis"}
          </span>
        </header>
        {!submitted ? (
          <div className={styles.empty}>
            <h3>Aucun bilan initial transmis</h3>
            <p>
              Le client peut enregistrer un brouillon, mais ses réponses ne
              deviennent visibles ici qu’après la transmission.
            </p>
          </div>
        ) : assessment.responses === null ? (
          <div className={styles.empty}>
            <Feedback>
              Le bilan est marqué comme transmis, mais ses réponses ne sont pas
              disponibles. Actualise le dossier pour réessayer.
            </Feedback>
          </div>
        ) : (
          <>
            <div className={styles.empty}>
              <p>
                {submittedAt
                  ? `Transmis le ${submittedAt}.`
                  : "Le bilan initial a été transmis."}
                {" "}
                Cette première étape ne signifie pas que toute la Week Zero est
                terminée.
              </p>
            </div>
            <div className={styles.sections}>
              {assessmentSections(assessment.responses).map((section) => (
                <section
                  className={styles.section}
                  data-testid={`assessment-${section.id}`}
                  key={section.id}
                >
                  <h3>{section.title}</h3>
                  <dl className={styles.values}>
                    {section.items.map((item) => (
                      <div className={styles.value} key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
