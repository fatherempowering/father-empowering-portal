import { NextResponse } from "next/server";

import { verifyClientLoginOtp } from "@/lib/auth/client-otp-login";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { requestFingerprint } from "@/lib/http/request-fingerprint";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readM1JsonObject(request);
    await verifyClientLoginOtp(body.email, body.otp, requestFingerprint(request));
    return NextResponse.json(
      { data: { authenticated: true, redirectTo: "/client" } },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
