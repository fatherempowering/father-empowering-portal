import { getCoachClientWeekZeroPhotoHttp } from "@/features/week-zero/server/acquisition-http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;
  return getCoachClientWeekZeroPhotoHttp(request, clientId);
}
