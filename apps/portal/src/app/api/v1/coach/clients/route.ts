import { requireCoachVerified } from "@/lib/auth/actor";
import { createClientHttp, listClientsHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireCoachVerified();
    return listClientsHttp(actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireCoachVerified();
    return createClientHttp(request, actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
