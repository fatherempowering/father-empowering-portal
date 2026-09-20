import { requireCoachVerified } from "@/lib/auth/actor";
import { revokeInvitationHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const actor = await requireCoachVerified();
    const { clientId } = await context.params;
    return revokeInvitationHttp(request, clientId, actor, getCoachM1Service());
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
