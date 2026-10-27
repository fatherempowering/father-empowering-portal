import { NextResponse } from "next/server";
import { requireCoachVerified } from "@/lib/auth/actor";
import { exercisePilotQuerySchema } from "@/lib/contracts/exercise-pilot";
import { M1ContractError } from "@/lib/contracts/m1";
import { m1ErrorResponse } from "@/lib/http/m1-error";

export async function listExercisePilotHttp(request: Request) {
  try {
    // The same verified staff boundary as the existing Coach library. No new
    // role, service credentials, database writes or client-visible draft route.
    await requireCoachVerified();
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length) throw new M1ContractError("VALIDATION_FAILED", "Invalid request.", 400);
    const input = exercisePilotQuerySchema.parse(Object.fromEntries(params));
    const { readPilotCatalog } = await import("@/lib/training/pilot/catalog.server");
    return NextResponse.json({ data: readPilotCatalog(input) }, { headers: {
      "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "Vary": "Cookie",
    } });
  } catch (error) { return m1ErrorResponse(error); }
}
