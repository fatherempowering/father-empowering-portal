import { NextResponse } from "next/server";

import { verifyCoachEmailOtp } from "@/lib/auth/coach-email-verification";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { settlePublicAuthResponse } from "@/lib/http/public-auth-timing";
import { requestFingerprint } from "@/lib/http/request-fingerprint";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = await readM1JsonObject(request);
    const startedAt = Date.now();
    let response: Response;
    try {
      await verifyCoachEmailOtp(body.code, requestFingerprint(request));
      response = NextResponse.json(
        { data: { verified: true, redirectTo: "/coach" } },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    } catch (error) {
      response = m1ErrorResponse(error);
    }
    await settlePublicAuthResponse(startedAt);
    return response;
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
