import { requireCoachAal2 } from "@/lib/auth/actor";
import { createClientHttp, listClientsHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";
import { m1ErrorResponse } from "@/lib/http/m1-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireCoachAal2();
    return listClientsHttp(actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCoachAal2();
    return createClientHttp(request, actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
