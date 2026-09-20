"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CoachDashboardClient,
  CoachDashboardResponse,
  CreateClientFormValues,
  CreateClientResult,
  InvitationMutationResult,
} from "../model";
import { CreateClientDialog } from "./create-client-dialog";
import { requestCoachLogout } from "../auth/request-coach-logout";
import {
  invitationMutationKey,
  type InvitationMutationAction,
} from "./invitation-mutation-key";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { Modal } from "@/components/fe/modal";
import { invitationPresentation } from "./invitation-presentation";

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

function mutationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `m1-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !body.data) {
    throw new Error(
      body.error?.message ?? "Une erreur est survenue. Réessaie.",
    );
  }
  return body.data;
}

function initials(client: CoachDashboardClient): string {
  return `${client.firstName[0] ?? ""}${client.lastName[0] ?? ""}`.toUpperCase();
}

function invitationCanResend(client: CoachDashboardClient): boolean {
  return (
    client.status === "INVITED" &&
    client.invitation !== null &&
    client.invitation.status !== "ACCEPTED"
  );
}

function invitationCanRevoke(client: CoachDashboardClient): boolean {
  return (
    client.status === "INVITED" &&
    (client.invitation?.status === "PENDING" ||
      client.invitation?.status === "SENT")
  );
}

function mergeClient(
  clients: CoachDashboardClient[],
  next: CoachDashboardClient,
): CoachDashboardClient[] {
  const exists = clients.some((client) => client.id === next.id);
  const merged = exists
    ? clients.map((client) => (client.id === next.id ? next : client))
    : [next, ...clients];
  return merged.sort((left, right) =>
    `${left.lastName}\0${left.firstName}`.localeCompare(
      `${right.lastName}\0${right.firstName}`,
      "fr",
    ),
  );
}

function toDashboardClient(
  result: CreateClientResult | InvitationMutationResult,
): CoachDashboardClient {
  return {
    id: result.client.id,
    firstName: result.client.firstName,
    lastName: result.client.lastName,
    email: result.client.email,
    locale: result.client.locale,
    timezone: result.client.timezone,
    status: result.client.status,
    invitation: result.invitation,
  };
}

export function CoachDashboard() {
  const [clients, setClients] = useState<CoachDashboardClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<CoachDashboardClient | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dialogSession, setDialogSession] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const createMutation = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const invitationMutations = useRef(new Map<string, string>());

  const activeCount = useMemo(
    () => clients.filter((client) => client.status === "ACTIVE").length,
    [clients],
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/coach/clients", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const result = await readResponse<CoachDashboardResponse>(response);
      setClients(result.clients);
      setNow(Date.now());
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Impossible de charger les clients.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refreshWhenVisible, 10_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  async function createClient(values: CreateClientFormValues) {
    const fingerprint = JSON.stringify(values);
    if (createMutation.current?.fingerprint !== fingerprint) {
      createMutation.current = { fingerprint, id: mutationId() };
    }
    const clientMutationId = createMutation.current.id;
    setBusyKey("create");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/coach/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, clientMutationId }),
      });
      const result = await readResponse<CreateClientResult>(response);
      createMutation.current = null;
      setClients((current) => mergeClient(current, toDashboardClient(result)));
      setDialogOpen(false);
      setDialogSession((value) => value + 1);
      setNotice(
        `La fiche de ${result.client.displayName} est créée et l’invitation est en préparation.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Impossible de créer le client.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function mutateInvitation(
    client: CoachDashboardClient,
    action: InvitationMutationAction,
  ) {
    if (!client.invitation) {
      setError(
        "L’invitation ciblée n’est plus disponible. Actualise la page et réessaie.",
      );
      return;
    }
    const key = invitationMutationKey(action, client.id, client.invitation.id);
    const clientMutationId =
      invitationMutations.current.get(key) ?? mutationId();
    invitationMutations.current.set(key, clientMutationId);
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/coach/clients/${encodeURIComponent(client.id)}/invitations/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientMutationId }),
        },
      );
      const result = await readResponse<InvitationMutationResult>(response);
      invitationMutations.current.delete(key);
      if (action === "revoke") setRevoking(null);
      setClients((current) => mergeClient(current, toDashboardClient(result)));
      setNotice(
        action === "resend"
          ? `Une nouvelle invitation est en préparation pour ${result.client.displayName}.`
          : `L’invitation de ${result.client.displayName} a été révoquée.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Impossible de modifier l’invitation.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  const invitedCount = clients.filter(
    (client) => client.status === "INVITED",
  ).length;

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const responseReceived = await requestCoachLogout(() => {
      setClients([]);
      window.location.replace("/login");
    });
    if (responseReceived) return;
    setSignOutError("Impossible de te déconnecter. Réessaie.");
    setSigningOut(false);
  }

  return (
    <AppShell space="coach">
      <header className="fe-page-heading">
        <div>
          <p className="fe-kicker">Father Empowering</p>
          <h1 className="fe-title">Clients</h1>
          <p className="fe-intro">
            Gère les invitations et suis l’activation des portails.
          </p>
        </div>
        <div className="fe-page-actions">
          <button
            className="fe-button"
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut || busyKey !== null}
          >
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
          <button
            className="fe-button fe-button-primary"
            type="button"
            onClick={() => {
              setError(null);
              setDialogOpen(true);
            }}
            disabled={signingOut || busyKey !== null}
          >
            <Icon name="plus" />
            Ajouter un client
          </button>
        </div>
      </header>
      {signOutError ? <Feedback>{signOutError}</Feedback> : null}
      {notice ? <Feedback tone="success">{notice}</Feedback> : null}
      {(loadError || error) && !dialogOpen && !revoking ? (
        <Feedback>
          {error ?? loadError}
          <br />
          <button
            className="fe-text-button"
            onClick={() => {
              setError(null);
              void load();
            }}
            type="button"
            disabled={busyKey !== null || loading}
          >
            Actualiser la liste
          </button>
        </Feedback>
      ) : null}
      <section
        className="fe-panel"
        aria-labelledby="clients-title"
        aria-busy={loading}
      >
        <header className="fe-panel-header">
          <h2 id="clients-title">
            {loading || (loadError && clients.length === 0)
              ? "Liste des clients"
              : `${clients.length} client${clients.length === 1 ? "" : "s"}`}
          </h2>
          {!loading && !(loadError && clients.length === 0) ? (
            <p>
              {activeCount} actif{activeCount === 1 ? "" : "s"} · {invitedCount}{" "}
              activation{invitedCount === 1 ? "" : "s"} en attente
            </p>
          ) : null}
        </header>
        {loading ? (
          <Loading>Chargement des clients…</Loading>
        ) : clients.length === 0 ? (
          <div className="fe-empty">
            <h3>
              {loadError
                ? "La liste n’a pas pu être chargée."
                : "Ton premier client commence ici."}
            </h3>
            <p>
              {loadError
                ? "Actualise la liste pour réessayer."
                : "Crée sa fiche et prépare son invitation. Il deviendra actif après avoir ouvert son lien et validé son code courriel."}
            </p>
          </div>
        ) : (
          <>
            <div className="fe-list-head" aria-hidden="true">
              <span>Client</span>
              <span>Accès au portail</span>
              <span>Actions</span>
            </div>
            <ul className="fe-client-list">
              {clients.map((client) => {
                const canResend = invitationCanResend(client);
                const canRevoke = invitationCanRevoke(client);
                const status = invitationPresentation(client, now);
                const resendBusyKey = client.invitation
                  ? invitationMutationKey(
                      "resend",
                      client.id,
                      client.invitation.id,
                    )
                  : null;
                return (
                  <li className="fe-client-row" key={client.id}>
                    <div className="fe-client-name">
                      <span className="fe-avatar" aria-hidden="true">
                        {initials(client)}
                      </span>
                      <div>
                        <strong>
                          {client.firstName} {client.lastName}
                        </strong>
                        <small>{client.email}</small>
                      </div>
                    </div>
                    <div className="fe-client-status">
                      <span
                        className={`fe-badge ${status.tone === "active" ? "fe-badge-active" : status.tone === "warning" ? "fe-badge-warning" : ""}`}
                      >
                        <Icon name={status.icon} />
                        {status.label}
                      </span>
                      <small className="fe-status-meta">{status.detail}</small>
                    </div>
                    <div className="fe-client-actions">
                      {canResend ? (
                        <button
                          className="fe-text-button"
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() =>
                            void mutateInvitation(client, "resend")
                          }
                        >
                          {busyKey === resendBusyKey ? "Renvoi…" : "Renvoyer"}
                        </button>
                      ) : null}
                      {canRevoke ? (
                        <button
                          className="fe-text-button fe-text-danger"
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => {
                            setError(null);
                            setRevoking(client);
                          }}
                        >
                          Révoquer
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <section className="fe-activation-help">
        <h2>Comment un client devient actif</h2>
        <ol>
          <li>Il ouvre son invitation.</li>
          <li>Il reçoit son code courriel.</li>
          <li>Il valide son code et accède au portail.</li>
        </ol>
      </section>
      <CreateClientDialog
        key={dialogSession}
        busy={busyKey === "create"}
        error={dialogOpen ? error : null}
        onClose={() => {
          if (busyKey === null) {
            createMutation.current = null;
            setDialogOpen(false);
            setError(null);
          }
        }}
        onSubmit={createClient}
        open={dialogOpen}
      />
      <Modal
        open={revoking !== null}
        busy={busyKey !== null}
        onClose={() => {
          if (busyKey === null) {
            setRevoking(null);
            setError(null);
          }
        }}
        labelledBy="revoke-title"
        describedBy="revoke-description"
      >
        <header className="fe-dialog-header">
          <div>
            <p className="fe-kicker">Invitation</p>
            <h2 id="revoke-title">Révoquer cette invitation ?</h2>
            <p className="fe-intro" id="revoke-description">
              Le lien de {revoking?.firstName} {revoking?.lastName} ne permettra
              plus d’activer son portail. Tu pourras envoyer une nouvelle
              invitation.
            </p>
          </div>
        </header>
        <div className="fe-dialog-content">
          {error ? <Feedback>{error}</Feedback> : null}
          <div className="fe-form-actions">
            <button
              className="fe-button"
              type="button"
              disabled={busyKey !== null}
              onClick={() => {
                setRevoking(null);
                setError(null);
              }}
            >
              Annuler
            </button>
            <button
              className="fe-button fe-button-danger"
              type="button"
              disabled={busyKey !== null}
              onClick={() => {
                if (revoking) void mutateInvitation(revoking, "revoke");
              }}
            >
              {busyKey !== null ? "Révocation…" : "Révoquer l’invitation"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
