import {
  getOwnWeekZeroPhotoHttp,
  uploadOwnWeekZeroPhotoHttp,
} from "@/features/week-zero/server/acquisition-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getOwnWeekZeroPhotoHttp(request);
}

export async function POST(request: Request) {
  return uploadOwnWeekZeroPhotoHttp(request);
}
