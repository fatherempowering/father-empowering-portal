import {
  getOwnWeekZeroAcquisitionHttp,
  saveOwnWeekZeroAcquisitionHttp,
} from "@/features/week-zero/server/acquisition-http";

export const dynamic = "force-dynamic";

export async function GET() {
  return getOwnWeekZeroAcquisitionHttp();
}

export async function PUT(request: Request) {
  return saveOwnWeekZeroAcquisitionHttp(request);
}
