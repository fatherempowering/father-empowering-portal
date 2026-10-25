import { getOwnCheckInsHttp, mutateOwnCheckInHttp } from "@/features/followup/server/http";
export const dynamic = "force-dynamic";
export const GET = getOwnCheckInsHttp;
export const POST = mutateOwnCheckInHttp;
