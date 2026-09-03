import type { Metadata } from "next";

import { ClientActivationCard } from "@/features/client/activation/client-activation-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activate your portal | Father Empowering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ActivatePage() {
  return <ClientActivationCard />;
}
