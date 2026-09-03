import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyTotpFactor } from "@/lib/auth/mfa";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

const requestSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = requestSchema.parse(await readM1JsonObject(request));
    await verifyTotpFactor(input.factorId, input.code);
    return NextResponse.json(
      { data: { verified: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = m1ErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
