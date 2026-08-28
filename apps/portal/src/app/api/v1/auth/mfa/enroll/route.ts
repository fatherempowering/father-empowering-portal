import { NextResponse } from "next/server";

import { enrollTotp } from "@/lib/auth/mfa";
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
  } catch {
    return NextResponse.json(
      { error: { code: "FORBIDDEN" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
