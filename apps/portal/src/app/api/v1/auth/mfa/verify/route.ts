import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyTotpFactor } from "@/lib/auth/mfa";
import { requireSameOrigin } from "@/lib/http/origin";

const requestSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = requestSchema.parse(await request.json());
    await verifyTotpFactor(input.factorId, input.code);
    return NextResponse.json(
      { data: { verified: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_MFA_CODE" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
