import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { MfaPanel } from "./panel";
import { getServerActor } from "@/lib/auth/actor";
import { listTotpFactors } from "@/lib/auth/mfa";
import { AuthShell } from "@/components/fe/auth-shell";
import { requireStaffPasswordRecoveryGrant } from "@/lib/auth/staff-password-recovery";
import { STAFF_PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/staff-password-recovery-grant";

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");

  const { next } = await searchParams;
  let recoveryDestination = false;
  if (next === "/reset-password") {
    const cookieStore = await cookies();
    try {
      await requireStaffPasswordRecoveryGrant(
        cookieStore.get(STAFF_PASSWORD_RECOVERY_COOKIE)?.value,
      );
      recoveryDestination = true;
    } catch {
      recoveryDestination = false;
    }
  }
  const destination = recoveryDestination ? "/reset-password" : "/coach";
  if (actor.aal === "aal2") redirect(destination);

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
      <MfaPanel
        verifiedFactorId={verified?.id ?? null}
        destination={destination}
      />
    </AuthShell>
  );
}
