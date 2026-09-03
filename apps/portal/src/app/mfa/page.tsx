import { redirect } from "next/navigation";

import { MfaPanel } from "./panel";
import { getServerActor } from "@/lib/auth/actor";
import { listTotpFactors } from "@/lib/auth/mfa";

export default async function MfaPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  if (actor.aal === "aal2") redirect("/coach");

  const verified = (await listTotpFactors()).find((factor) => factor.status === "verified");
  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 24, fontFamily: "system-ui" }}>
      <p>FATHER EMPOWERING</p>
      <h1>Vérification en deux étapes</h1>
      <p>Cette protection est obligatoire pour accéder aux dossiers clients.</p>
      <MfaPanel verifiedFactorId={verified?.id ?? null} />
    </main>
  );
}
