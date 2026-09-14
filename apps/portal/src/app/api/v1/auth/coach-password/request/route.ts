import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requestStaffPasswordRecovery } from "@/lib/auth/staff-password-recovery";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { settlePublicAuthResponse } from "@/lib/http/public-auth-timing";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = await readM1JsonObject(request);
    const startedAt = Date.now();
    try {
      await requestStaffPasswordRecovery(body.email);
    } catch (error) {
      // Once structurally valid, unknown accounts, non-staff identities,
      // throttling and provider failures have the same public result.
      if (error instanceof ZodError) throw error;
    }
    await settlePublicAuthResponse(startedAt);
    return NextResponse.json(
      { data: { accepted: true } },
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
