import { submitOwnInitialAssessmentHttp } from "@/features/week-zero/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return submitOwnInitialAssessmentHttp(request);
}
