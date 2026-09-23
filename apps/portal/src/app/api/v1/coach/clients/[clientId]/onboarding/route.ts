import { getCoachClientOnboardingHttp } from "@/features/onboarding/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;
  return getCoachClientOnboardingHttp(clientId);
}
