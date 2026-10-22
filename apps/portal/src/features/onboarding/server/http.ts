import { NextResponse } from "next/server";

import {
  saveOnboardingRequestSchema,
  submitOnboardingRequestSchema,
} from "@/lib/contracts/onboarding";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import {
  getCoachClientOnboardingIntake,
  getOwnOnboardingIntake,
  saveOwnOnboardingIntake,
  submitOwnOnboardingIntake,
} from "@/lib/onboarding/onboarding-repository";

export const MAX_ONBOARDING_JSON_BYTES = 262_144;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function getOwnOnboardingHttp(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: { intake: await getOwnOnboardingIntake() } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function saveOwnOnboardingHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = saveOnboardingRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_ONBOARDING_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { intake: await saveOwnOnboardingIntake(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function submitOwnOnboardingHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = submitOnboardingRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_ONBOARDING_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { intake: await submitOwnOnboardingIntake(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function getCoachClientOnboardingHttp(clientId: string): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: await getCoachClientOnboardingIntake(clientId) },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
