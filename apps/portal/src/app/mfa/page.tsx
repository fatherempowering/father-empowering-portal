import { redirect } from "next/navigation";

import { MfaPanel } from "./panel";
import { getServerActor } from "@/lib/auth/actor";
import { listTotpFactors } from "@/lib/auth/mfa";
import { AuthShell } from "@/components/fe/auth-shell";

export default async function MfaPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  if (actor.aal === "aal2") redirect("/coach");

  const verified = (await listTotpFactors()).find(
    (factor) => factor.status === "verified",
  );
  return (
    <AuthShell>
      <p className="fe-kicker">Espace Coach · Vérification</p>
      <h1 className="fe-title">
        {verified ? "Confirme ton identité." : "Protège ton espace."}
      </h1>
      <p className="fe-intro">
        {verified
          ? "Entre le code de ton application d’authentification."
          : "Configure la vérification en deux étapes pour accéder aux dossiers de tes clients."}
      </p>
      <MfaPanel verifiedFactorId={verified?.id ?? null} />
    </AuthShell>
  );
}
