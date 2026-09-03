import { NextResponse } from "next/server";

import { enrollTotp } from "@/lib/auth/mfa";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const enrollment = await enrollTotp();
    return NextResponse.json(
      {
        data: {
          factorId: enrollment.id,
          qrCode: enrollment.totp.qr_code,
          secret: enrollment.totp.secret,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = m1ErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
