import { getCoachClientInitialAssessmentHttp } from "@/features/week-zero/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;
  return getCoachClientInitialAssessmentHttp(clientId);
}
