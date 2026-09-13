import { NextResponse } from "next/server";

import { signOutClientSession } from "@/lib/auth/client-session";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    await signOutClientSession();
    return NextResponse.json(
      { data: { signedOut: true, redirectTo: "/client-login" } },
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
