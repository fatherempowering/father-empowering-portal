import { ClientOnboarding } from "@/features/client/onboarding/client-onboarding";

export default async function OnboardingPage({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  return <ClientOnboarding reviewSubmittedResponses={view === "responses"} />;
}
