import { NextResponse } from "next/server";

import { signOutCoachSession } from "@/lib/auth/coach-session";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    await signOutCoachSession();
    return NextResponse.json(
      { data: { signedOut: true, redirectTo: "/login" } },
      {
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
