import { getCoachCheckInsHttp } from "@/features/followup/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) { return getCoachCheckInsHttp(request, (await context.params).clientId); }
