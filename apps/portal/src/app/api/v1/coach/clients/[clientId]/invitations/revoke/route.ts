import { requireCoachAal2 } from "@/lib/auth/actor";
import { revokeInvitationHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";
import { m1ErrorResponse } from "@/lib/http/m1-error";

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireCoachAal2();
    const { clientId } = await context.params;
    return revokeInvitationHttp(request, clientId, actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
