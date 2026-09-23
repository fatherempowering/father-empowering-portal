import { submitOwnOnboardingHttp } from "@/features/onboarding/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return submitOwnOnboardingHttp(request);
}
