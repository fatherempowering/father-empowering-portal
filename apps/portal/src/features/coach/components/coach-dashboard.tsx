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
import styles from "./coach-dashboard.module.css";

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

function mutationId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `m1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Une erreur est survenue. Réessaie.");
  }
  return body.data;
}

function initials(client: CoachDashboardClient): string {
  return `${client.firstName[0] ?? ""}${client.lastName[0] ?? ""}`.toUpperCase();
}

function invitationCanResend(client: CoachDashboardClient): boolean {
  return client.status === "INVITED" &&
    client.invitation !== null &&
    client.invitation.status !== "ACCEPTED";
}

function invitationCanRevoke(client: CoachDashboardClient): boolean {
  return client.status === "INVITED" &&
    (client.invitation?.status === "PENDING" || client.invitation?.status === "SENT");
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
  const [notice, setNotice] = useState<string | null>(null);
  const createMutation = useRef<{ fingerprint: string; id: string } | null>(null);
  const invitationMutations = useRef(new Map<string, string>());

  const activeCount = useMemo(
    () => clients.filter((client) => client.status === "ACTIVE").length,
    [clients],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/v1/coach/clients", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const result = await readResponse<CoachDashboardResponse>(response);
      setClients(result.clients);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les clients.");
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
      setNotice(
        `La fiche de ${result.client.displayName} est créée et l’invitation est en préparation.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer le client.");
    } finally {
      setBusyKey(null);
    }
  }

  async function mutateInvitation(client: CoachDashboardClient, action: "resend" | "revoke") {
    const key = `${action}:${client.id}`;
    const clientMutationId = invitationMutations.current.get(key) ?? mutationId();
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
      setClients((current) => mergeClient(current, toDashboardClient(result)));
      setNotice(
        action === "resend"
          ? `Une nouvelle invitation est en préparation pour ${result.client.displayName}.`
          : `L’invitation de ${result.client.displayName} a été révoquée.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier l’invitation.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Father Empowering</p>
            <h1 className={styles.title}>Espace Coach</h1>
            <p className={styles.subtitle}>
              Crée les accès clients et suis leur activation depuis une seule vue
              sécurisée.
            </p>
          </div>
          <button className={styles.button} onClick={() => setDialogOpen(true)} type="button">
            Ajouter un client
          </button>
        </header>

        {notice ? (
          <p aria-live="polite" className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        {error && !dialogOpen ? (
          <p aria-live="assertive" className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <section aria-labelledby="clients-title" className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Accès et assignations</p>
              <h2 className={styles.sectionTitle} id="clients-title">
                Clients
              </h2>
              <p className={styles.muted}>
                {activeCount} actif{activeCount === 1 ? "" : "s"}
              </p>
            </div>
            <span aria-label={`${clients.length} clients`} className={styles.count}>
              {clients.length}
            </span>
          </header>

          {loading ? (
            <p aria-live="polite" className={styles.loading}>
              Chargement des clients…
            </p>
          ) : clients.length === 0 ? (
            <div className={styles.empty}>
              <h3 className={styles.emptyTitle}>Ton premier client commence ici.</h3>
              <p className={styles.emptyText}>
                Crée sa fiche et envoie son invitation. Son état passera de « Invité »
                à « Actif » après l’activation sécurisée.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {clients.map((client) => {
                const canResend = invitationCanResend(client);
                const canRevoke = invitationCanRevoke(client);
                return (
                  <li className={styles.clientRow} key={client.id}>
                    <div className={styles.clientMain}>
                      <span aria-hidden="true" className={styles.avatar}>
                        {initials(client)}
                      </span>
                      <div>
                        <p className={styles.clientName}>
                          {client.firstName} {client.lastName}
                        </p>
                        <p className={styles.clientMeta}>{client.email}</p>
                      </div>
                      <span
                        className={`${styles.status} ${
                          client.status === "ACTIVE" ? styles.statusActive : ""
                        }`}
                      >
                        {client.status === "ACTIVE" ? "Actif" : "Invité"}
                      </span>
                    </div>

                    {canResend || canRevoke ? (
                      <div className={styles.actions}>
                        {canResend ? (
                          <button
                            className={styles.buttonSecondary}
                            disabled={busyKey !== null}
                            onClick={() => void mutateInvitation(client, "resend")}
                            type="button"
                          >
                            {busyKey === `resend:${client.id}` ? "Renvoi…" : "Renvoyer"}
                          </button>
                        ) : null}
                        {canRevoke ? (
                          <button
                            className={styles.buttonDanger}
                            disabled={busyKey !== null}
                            onClick={() => void mutateInvitation(client, "revoke")}
                            type="button"
                          >
                            {busyKey === `revoke:${client.id}` ? "Révocation…" : "Révoquer"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <CreateClientDialog
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
    </main>
  );
}
