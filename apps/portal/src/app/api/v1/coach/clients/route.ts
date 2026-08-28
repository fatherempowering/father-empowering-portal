import { requireCoachAal2 } from "@/lib/auth/actor";
import { createClientHttp, listClientsHttp } from "@/features/coach/server/http";
import { getCoachM1Service } from "@/features/coach/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireCoachAal2();
  return listClientsHttp(actor, getCoachM1Service());
}

export async function POST(request: Request) {
  const actor = await requireCoachAal2();
  return createClientHttp(request, actor, getCoachM1Service());
}

