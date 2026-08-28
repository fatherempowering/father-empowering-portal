import type { Metadata } from "next";

import { ClientActivationCard } from "@/features/client/activation/client-activation-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activate your portal | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return <ClientActivationCard invitationToken={token} />;
}
