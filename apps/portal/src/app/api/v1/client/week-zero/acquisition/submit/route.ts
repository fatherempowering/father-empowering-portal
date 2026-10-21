import { submitOwnWeekZeroAcquisitionHttp } from "@/features/week-zero/server/acquisition-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return submitOwnWeekZeroAcquisitionHttp(request);
}
