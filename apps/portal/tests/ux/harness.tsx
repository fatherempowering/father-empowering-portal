// Isolated presentation harness. This is never an application route or an auth gate.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CoachDashboard } from "../../src/features/coach/components/coach-dashboard";
import { ClientDashboard } from "../../src/features/client/dashboard/client-dashboard";
import { ClientActivationCard } from "../../src/features/client/activation/client-activation-card";
import { ClientLoginCard } from "../../src/features/client/auth/client-login-card";
import { CoachEmailVerificationCard } from "../../src/features/coach/auth/coach-email-verification-card";
import { ClientWeekZero } from "../../src/features/client/week-zero/client-week-zero";
import { EMPTY_INITIAL_ASSESSMENT_RESPONSES } from "../../src/lib/contracts/week-zero";
import { AuthShell } from "../../src/components/fe/auth-shell";
import { CodeInput } from "../../src/components/fe/code-input";
import { LandingPage } from "../../src/components/fe/landing/landing-page";
import "../../src/app/globals.css";

const now = Date.now();
let records = [
  ["Alex", "Martin", "ACTIVE", "ACCEPTED"],
  ["David", "Roy", "INVITED", "PENDING"],
  ["Julien", "Moreau", "INVITED", "SENT"],
  ["Nicolas", "Gagnon", "INVITED", "EXPIRED"],
  ["Samuel", "Bouchard", "INVITED", "REVOKED"],
].map(([firstName, lastName, status, invitationStatus], i) => ({
  id: `client-${i}`,
  firstName,
  lastName,
  displayName: `${firstName} ${lastName}`,
  email: `${firstName.toLowerCase()}@example.test`,
  status,
  locale: "fr",
  timezone: "America/Toronto",
  invitation: {
    id: `invitation-${i}`,
    clientId: `client-${i}`,
    status: invitationStatus,
    email: `${firstName.toLowerCase()}@example.test`,
    expiresAt: new Date(
      now + (invitationStatus === "EXPIRED" ? -86400000 : 604800000),
    ).toISOString(),
    sentAt: new Date(now).toISOString(),
    acceptedAt: null,
  },
}));
const harnessParameters = new URLSearchParams(window.location.search);
let scenario = harnessParameters.get("state") ?? "normal";
let message = "";
let clientRequestAttempts = 0;
let failedSaveMutationId: string | null = null;
let assessmentConflictOccurred = false;

const assessmentResponses = () =>
  structuredClone(EMPTY_INITIAL_ASSESSMENT_RESPONSES);

function assessmentSnapshot(
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" = "NOT_STARTED",
) {
  const responses = assessmentResponses();
  if (status !== "NOT_STARTED") {
    responses.measurements.bodyWeightLb = status === "DRAFT" ? 207.5 : 198.5;
    responses.measurements.waistIn = status === "DRAFT" ? 39.5 : 37.75;
    responses.measurements.other = "Mesure persistée dans le brouillon.";
  }
  if (status === "SUBMITTED") {
    responses.mobility = {
      painSquat: "NO",
      painHinge: "NO",
      painPush: "NO",
      painPull: "NO",
      painCardio: "NO",
      limitedMovement: "N.A.",
      comfortableMovement: "Marche",
      tightArea: "N.A.",
    };
    responses.availability = {
      days: ["MONDAY", "WEDNESDAY"],
      bestTime: "Matin",
      sessionDurationMinutes: 40,
      sessionsPerWeek: 3,
      constraints: null,
    };
  }
  return {
    kind: "INITIAL_ASSESSMENT",
    schemaVersion: 1,
    status,
    version: status === "NOT_STARTED" ? 0 : status === "DRAFT" ? 2 : 3,
    responses,
    updatedAt: status === "NOT_STARTED" ? null : new Date(now).toISOString(),
    submittedAt: status === "SUBMITTED" ? new Date(now).toISOString() : null,
  };
}
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
window.fetch = async (url, init) => {
  const path = String(url);
  if (scenario === "network") throw new TypeError("Network unavailable");
  if (
    path.endsWith("/client/me") &&
    scenario === "client-request-hang-once" &&
    clientRequestAttempts++ === 0
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (scenario === "error")
    return reply(
      {
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "Réessaie dans quelques instants.",
        },
      },
      503,
    );
  if (path.endsWith("/client/me"))
    return reply({
      client: {
        clientId: "client-0",
        displayName: "Alex Martin",
        status: "ACTIVE",
        locale: scenario === "english" ? "en-CA" : "fr-CA",
        timezone: "Asia/Tokyo",
      },
    });
  if (path.endsWith("/client/week-zero/submit") && init?.method === "POST") {
    const submitted = assessmentSnapshot("SUBMITTED");
    return reply({ data: { assessment: submitted } });
  }
  if (path.endsWith("/client/week-zero") && init?.method === "PUT") {
    const command = JSON.parse(String(init.body)) as {
      clientMutationId: string;
      expectedVersion: number;
      responses: typeof EMPTY_INITIAL_ASSESSMENT_RESPONSES;
    };
    if (scenario === "assessment-save-error-once" && failedSaveMutationId === null) {
      failedSaveMutationId = command.clientMutationId;
      return reply(
        { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
        503,
      );
    }
    if (
      scenario === "assessment-save-error-once" &&
      failedSaveMutationId !== command.clientMutationId
    ) {
      return reply(
        { error: { code: "DUPLICATE", message: "Command changed during retry" } },
        409,
      );
    }
    if (scenario === "assessment-conflict") {
      assessmentConflictOccurred = true;
      return reply(
        { error: { code: "VERSION_CONFLICT", message: "Version conflict" } },
        409,
      );
    }
    return reply({
      data: {
        assessment: {
          kind: "INITIAL_ASSESSMENT",
          schemaVersion: 1,
          status: "DRAFT",
          version: command.expectedVersion + 1,
          responses: command.responses,
          updatedAt: new Date(now).toISOString(),
          submittedAt: null,
        },
      },
    });
  }
  if (path.endsWith("/client/week-zero")) {
    if (scenario === "assessment-draft") {
      return reply({ data: { assessment: assessmentSnapshot("DRAFT") } });
    }
    if (scenario === "assessment-submitted") {
      return reply({ data: { assessment: assessmentSnapshot("SUBMITTED") } });
    }
    if (scenario === "assessment-conflict" && assessmentConflictOccurred) {
      const saved = assessmentSnapshot("DRAFT");
      saved.responses.measurements.bodyWeightLb = 199;
      return reply({ data: { assessment: saved } });
    }
    return reply({ data: { assessment: assessmentSnapshot() } });
  }
  if (path.endsWith("/coach/clients") && !init?.method)
    return reply({ data: { clients: scenario === "empty" ? [] : records } });
  if (path.endsWith("/coach/clients") && init?.method === "POST") {
    const values = JSON.parse(String(init.body));
    const record = {
      ...records[1],
      ...values,
      id: "created",
      displayName: `${values.firstName} ${values.lastName}`,
      invitation: { ...records[1].invitation, id: "new-invitation" },
    };
    records = [record, ...records];
    return reply({
      data: {
        client: record,
        invitation: record.invitation,
        deliveryQueued: true,
      },
    });
  }
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-hang"
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-error"
  )
    return reply(
      { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unavailable" } },
      503,
    );
  if (
    path.endsWith("/auth/coach-email-otp/request") &&
    scenario === "coach-request-unauthorized"
  )
    return reply(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      401,
    );
  if (path.endsWith("/auth/coach-email-otp/request"))
    return reply(
      {
        data: {
          accepted: true,
          emailHint: "m••••@gmail.com",
          retryAfterSeconds: 1,
        },
      },
      202,
    );
  if (
    path.endsWith("/auth/coach-email-otp/verify") &&
    scenario === "coach-verify-rate-limit"
  )
    return reply(
      { error: { code: "RATE_LIMITED", message: "Too many attempts" } },
      429,
    );
  if (path.endsWith("/auth/coach-email-otp/verify"))
    return reply(
      { error: { code: "UNAUTHENTICATED", message: "Invalid or expired code" } },
      401,
    );
  if (
    path.endsWith("/auth/coach-logout") &&
    scenario === "coach-logout-hang"
  )
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  if (path.endsWith("/auth/coach-logout"))
    return reply({ data: { signedOut: true, redirectTo: "/login" } });
  if (path.includes("/invitations/")) {
    const id = path.split("/").at(-3);
    records = records.map((record) =>
      record.id === id
        ? {
            ...record,
            invitation: {
              ...record.invitation,
              status: path.endsWith("/revoke") ? "REVOKED" : "PENDING",
            },
          }
        : record,
    );
    const record = records.find((record) => record.id === id)!;
    return reply({
      data: {
        client: record,
        invitation: record.invitation,
        deliveryQueued: true,
      },
    });
  }
  if (path.includes("/verify")) {
    message = "Vérification simulée reçue";
    return reply(
      { error: { message: "Le code est invalide ou expiré." } },
      400,
    );
  }
  if (path.includes("/activation"))
    return reply({
      invitation: {
        invitationId: "invitation",
        emailHint: "a•••@example.test",
        locale: "fr-CA",
        expiresAt: new Date(now + 604800000).toISOString(),
        state: "PENDING",
      },
    });
  return reply({ data: {} });
};
function CodeExercise() {
  const [code, setCode] = useState("");
  return (
    <AuthShell>
      <h1 className="fe-title">Test de saisie</h1>
      <form className="fe-form" onSubmit={(event) => event.preventDefault()}>
        <CodeInput value={code} onChange={setCode} />
        <output aria-label="Code de test">{JSON.stringify(code)}</output>
        <button className="fe-button" disabled={!/^\d{6}$/.test(code)}>
          Continuer
        </button>
      </form>
    </AuthShell>
  );
}
function Harness() {
  const initialView = harnessParameters.get("screen");
  const [view, setView] = useState(initialView ?? "coach");
  const [key, setKey] = useState(0);
  if (view === "landing-en" || view === "landing-fr") {
    return <LandingPage locale={view === "landing-fr" ? "fr" : "en"} />;
  }
  if (view === "client-v2") {
    return <ClientDashboard loadTimeoutMs={5_000} />;
  }
  if (view === "client-week-zero") {
    return <ClientWeekZero />;
  }
  return (
    <>
      <header
        style={{
          padding: 12,
          background: "#fff",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <strong>Test UI · données fictives</strong>
        <label>
          Écran{" "}
          <select
            value={view}
            onChange={(event) => {
              setView(event.target.value);
              setKey(key + 1);
            }}
          >
            <option value="coach">Coach</option>
            <option value="landing-en">Landing · English</option>
            <option value="landing-fr">Landing · Français</option>
            <option value="client">Client</option>
            <option value="client-v2">Client · Pilote V2</option>
            <option value="client-today">Client · Aujourd’hui</option>
            <option value="client-week-zero">Client · Week Zero</option>
            <option value="login">Connexion Client</option>
            <option value="activation">Activation</option>
            <option value="verify-email">Vérification Coach</option>
            <option value="code">Saisie code</option>
          </select>
        </label>
        <label>
          État{" "}
          <select
            onChange={(event) => {
              scenario = event.target.value;
              clientRequestAttempts = 0;
              failedSaveMutationId = null;
              assessmentConflictOccurred = false;
              setKey(key + 1);
            }}
          >
            <option value="normal">Normal</option>
            <option value="empty">Vide</option>
            <option value="error">Erreur API</option>
            <option value="network">Réseau coupé</option>
            <option value="client-request-hang-once">Client · chargement suspendu</option>
            <option value="coach-request-hang">Coach · envoi suspendu</option>
            <option value="coach-request-error">Coach · échec d’envoi</option>
            <option value="coach-request-unauthorized">Coach · session expirée</option>
            <option value="coach-verify-rate-limit">Coach · trop d’essais</option>
            <option value="coach-logout-hang">Coach · déconnexion suspendue</option>
            <option value="english">English Client</option>
          </select>
        </label>
        <span role="status">{message}</span>
      </header>
      <div key={key}>
        {view === "coach" ? (
          <CoachDashboard />
        ) : view === "client" ? (
          <ClientDashboard loadTimeoutMs={350} />
        ) : view === "client-today" ? (
          <ClientDashboard view="today" loadTimeoutMs={350} />
        ) : view === "login" ? (
          <ClientLoginCard />
        ) : view === "activation" ? (
          <ClientActivationCard />
        ) : view === "verify-email" ? (
          <CoachEmailVerificationCard requestTimeoutMs={350} />
        ) : (
          <CodeExercise />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
