import { requireCoachAal2 } from "@/lib/auth/actor";
import { resendInvitationHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const actor = await requireCoachAal2();
  const { clientId } = await context.params;
  return resendInvitationHttp(request, clientId, actor, getCoachM1Service());
}

