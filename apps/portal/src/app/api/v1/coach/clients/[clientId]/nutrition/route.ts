import { getCoachNutritionHttp, mutateCoachNutritionHttp } from "@/features/followup/server/http";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ clientId: string }> }) { return getCoachNutritionHttp((await context.params).clientId); }
export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) { return mutateCoachNutritionHttp(request, (await context.params).clientId); }
