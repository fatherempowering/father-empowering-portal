import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback } from "@/components/fe/feedback";
import { PersonalPortalSetup } from "@/features/coach/personal-portal/personal-portal-setup";
import { getServerActor } from "@/lib/auth/actor";
import { getStaffPersonalProfile } from "@/lib/auth/own-client-access";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export default async function PersonalPortalPage() {
  const actor = await getServerActor();
  if (!actor) redirect("/login");
  if (actor.role === "CLIENT") redirect("/client");
  let personal;
  try { personal = await getStaffPersonalProfile(); }
  catch (error) {
    if (error instanceof M1ContractError && error.code === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof M1ContractError && error.code === "FORBIDDEN") redirect("/verify-email");
    throw error;
  }
  if (personal.profile?.status === "ACTIVE") redirect("/client");
  return <AppShell space="coach" current="personal">
    {personal.profile ? <>
      <h1 className="fe-title">Mon portail personnel</h1>
      <Feedback>Ton profil personnel est suspendu ou archivé. Ton espace Coach reste accessible. Aucune donnée n’a été remplacée.</Feedback>
      <Link className="fe-button" href="/coach">Retour à mon espace Coach</Link>
    </> : <PersonalPortalSetup />}
  </AppShell>;
}
