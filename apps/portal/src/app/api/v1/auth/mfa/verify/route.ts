import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyTotpFactor } from "@/lib/auth/mfa";

const requestSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    await verifyTotpFactor(input.factorId, input.code);
    return NextResponse.json({ data: { verified: true } });
  } catch {
    return NextResponse.json({ error: { code: "INVALID_MFA_CODE" } }, { status: 403 });
  }
}
