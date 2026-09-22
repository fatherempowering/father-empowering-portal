import {
  getOwnInitialAssessmentHttp,
  saveOwnInitialAssessmentHttp,
} from "@/features/week-zero/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return getOwnInitialAssessmentHttp();
}

export async function PUT(request: Request) {
  return saveOwnInitialAssessmentHttp(request);
}
