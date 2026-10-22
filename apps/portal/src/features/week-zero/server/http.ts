import { NextResponse } from "next/server";

import {
  saveInitialAssessmentRequestSchema,
  submitInitialAssessmentRequestSchema,
} from "@/lib/contracts/week-zero";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import {
  getCoachClientInitialAssessment,
  getOwnInitialAssessment,
  saveOwnInitialAssessment,
  submitOwnInitialAssessment,
} from "@/lib/week-zero/initial-assessment-repository";

const MAX_INITIAL_ASSESSMENT_JSON_BYTES = 32_768;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function getOwnInitialAssessmentHttp(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: { assessment: await getOwnInitialAssessment() } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function saveOwnInitialAssessmentHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = saveInitialAssessmentRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_INITIAL_ASSESSMENT_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { assessment: await saveOwnInitialAssessment(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function submitOwnInitialAssessmentHttp(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const input = submitInitialAssessmentRequestSchema.parse(
      await readJsonObjectWithLimit(request, MAX_INITIAL_ASSESSMENT_JSON_BYTES),
    );
    return NextResponse.json(
      { data: { assessment: await submitOwnInitialAssessment(input) } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function getCoachClientInitialAssessmentHttp(clientId: string): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { data: await getCoachClientInitialAssessment(clientId) },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
