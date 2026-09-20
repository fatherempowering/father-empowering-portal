import { NextResponse } from "next/server";

import { requestCoachEmailOtp } from "@/lib/auth/coach-email-verification";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { requestFingerprint } from "@/lib/http/request-fingerprint";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const result = await requestCoachEmailOtp(requestFingerprint(request));
    return NextResponse.json(
      {
        data: {
          accepted: true,
          emailHint: result.emailHint,
          retryAfterSeconds: result.retryAfterSeconds,
        },
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
