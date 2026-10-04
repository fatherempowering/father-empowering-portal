import { NextResponse } from "next/server";
import { createPersonalClient } from "@/lib/clients/personal-client";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { M1ContractError } from "@/lib/contracts/m1";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (new URL(request.url).search) {
      throw new M1ContractError("VALIDATION_FAILED", "Query parameters are not supported", 400);
    }
    const result = await createPersonalClient(await readM1JsonObject(request));
    return NextResponse.json({ data: { ...result, redirectTo: "/client" } }, {
      status: 201,
      headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) { return m1ErrorResponse(error); }
}
