import {
  getOwnOnboardingHttp,
  saveOwnOnboardingHttp,
} from "@/features/onboarding/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return getOwnOnboardingHttp();
}

export async function PUT(request: Request) {
  return saveOwnOnboardingHttp(request);
}
