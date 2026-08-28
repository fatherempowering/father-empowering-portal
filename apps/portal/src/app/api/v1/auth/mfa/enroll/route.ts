import { NextResponse } from "next/server";

import { enrollTotp } from "@/lib/auth/mfa";

export async function POST() {
  try {
    const enrollment = await enrollTotp();
    return NextResponse.json({
      data: {
        factorId: enrollment.id,
        qrCode: enrollment.totp.qr_code,
        secret: enrollment.totp.secret,
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
}
