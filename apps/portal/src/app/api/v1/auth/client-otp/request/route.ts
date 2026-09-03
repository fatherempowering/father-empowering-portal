import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requestClientLoginOtp } from "@/lib/auth/client-otp-login";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { settlePublicAuthResponse } from "@/lib/http/public-auth-timing";
import { requestFingerprint } from "@/lib/http/request-fingerprint";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readM1JsonObject(request);
    const startedAt = Date.now();
    try {
      await requestClientLoginOtp(body.email, requestFingerprint(request));
    } catch (error) {
      // Once the request is structurally valid, unknown/inactive addresses,
      // provider errors, audit failures and throttling share one public result.
      // This endpoint must not become an account-existence oracle.
      if (error instanceof ZodError) throw error;
    }
    await settlePublicAuthResponse(startedAt);
    return NextResponse.json(
      { data: { accepted: true } },
      { status: 202, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
