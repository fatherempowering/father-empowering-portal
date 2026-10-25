import { NextResponse } from "next/server";
import { checkInMutationSchema, nutritionMutationSchema } from "@/lib/contracts/client-followup";
import { M1ContractError } from "@/lib/contracts/m1";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { mutateCoachNutrition, mutateOwnCheckIn, readCoachCheckIns, readCoachNutrition, readOwnCheckIns, readOwnNutrition, readOwnProgression } from "@/lib/followup/followup-repository";

const headers = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "Referrer-Policy": "no-referrer" };
const response = (data: unknown) => NextResponse.json({ data }, { status: 200, headers });
function pageOf(request: Request) {
  const value = new URL(request.url).searchParams.get("page") ?? "0";
  if (!/^(0|[1-9][0-9]{0,4})$/.test(value) || Number(value) > 10000) throw new M1ContractError("VALIDATION_FAILED", "Invalid history page.", 400);
  return Number(value);
}
export async function getOwnNutritionHttp() { try { return response(await readOwnNutrition()); } catch (error) { return m1ErrorResponse(error); } }
export async function getOwnProgressionHttp() { try { return response(await readOwnProgression()); } catch (error) { return m1ErrorResponse(error); } }
export async function getOwnCheckInsHttp(request: Request) { try { return response(await readOwnCheckIns(pageOf(request))); } catch (error) { return m1ErrorResponse(error); } }
export async function mutateOwnCheckInHttp(request: Request) {
  try { requireSameOrigin(request); return response(await mutateOwnCheckIn(checkInMutationSchema.parse(await readJsonObjectWithLimit(request, 24_576)))); }
  catch (error) { return m1ErrorResponse(error); }
}
export async function getCoachNutritionHttp(clientId: string) { try { return response(await readCoachNutrition(clientId)); } catch (error) { return m1ErrorResponse(error); } }
export async function mutateCoachNutritionHttp(request: Request, clientId: string) {
  try { requireSameOrigin(request); return response(await mutateCoachNutrition(clientId, nutritionMutationSchema.parse(await readJsonObjectWithLimit(request, 786_432)))); }
  catch (error) { return m1ErrorResponse(error); }
}
export async function getCoachCheckInsHttp(request: Request, clientId: string) { try { return response(await readCoachCheckIns(clientId, pageOf(request))); } catch (error) { return m1ErrorResponse(error); } }
