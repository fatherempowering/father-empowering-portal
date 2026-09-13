// Isolated presentation harness. This is never an application route or an auth gate.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CoachDashboard } from "../../src/features/coach/components/coach-dashboard";
import { ClientDashboard } from "../../src/features/client/dashboard/client-dashboard";
import { ClientActivationCard } from "../../src/features/client/activation/client-activation-card";
import { ClientLoginCard } from "../../src/features/client/auth/client-login-card";
import { AuthShell } from "../../src/components/fe/auth-shell";
import { MfaPanel } from "../../src/app/mfa/panel";
import { CodeInput } from "../../src/components/fe/code-input";
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
let scenario = "normal";
let message = "";
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
window.fetch = async (url, init) => {
  const path = String(url);
  if (scenario === "network") throw new TypeError("Network unavailable");
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
  const [view, setView] = useState("coach");
  const [key, setKey] = useState(0);
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
            <option value="client">Client</option>
            <option value="login">Connexion Client</option>
            <option value="activation">Activation</option>
            <option value="mfa">MFA</option>
            <option value="code">Saisie code</option>
          </select>
        </label>
        <label>
          État{" "}
          <select
            onChange={(event) => {
              scenario = event.target.value;
              setKey(key + 1);
            }}
          >
            <option value="normal">Normal</option>
            <option value="empty">Vide</option>
            <option value="error">Erreur API</option>
            <option value="network">Réseau coupé</option>
            <option value="english">English Client</option>
          </select>
        </label>
        <span role="status">{message}</span>
      </header>
      <div key={key}>
        {view === "coach" ? (
          <CoachDashboard />
        ) : view === "client" ? (
          <ClientDashboard />
        ) : view === "login" ? (
          <ClientLoginCard />
        ) : view === "activation" ? (
          <ClientActivationCard />
        ) : view === "mfa" ? (
          <AuthShell>
            <h1 className="fe-title">Confirme ton identité.</h1>
            <MfaPanel verifiedFactorId="test-factor" />
          </AuthShell>
        ) : (
          <CodeExercise />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
