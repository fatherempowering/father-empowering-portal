import { getCoachClientWeekZeroAcquisitionHttp } from "@/features/week-zero/server/acquisition-http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;
  return getCoachClientWeekZeroAcquisitionHttp(clientId);
}
