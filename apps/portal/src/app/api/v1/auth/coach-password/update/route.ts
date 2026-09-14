import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { updateStaffPassword } from "@/lib/auth/staff-password-recovery";
import {
  STAFF_PASSWORD_RECOVERY_COOKIE,
} from "@/lib/auth/staff-password-recovery-grant";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = await readM1JsonObject(request);
    const cookieStore = await cookies();
    await updateStaffPassword(
      cookieStore.get(STAFF_PASSWORD_RECOVERY_COOKIE)?.value,
      body.password,
    );

    const response = NextResponse.json(
      { data: { updated: true, redirectTo: "/login?password=updated" } },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
    response.cookies.set(STAFF_PASSWORD_RECOVERY_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "invalid:").protocol === "https:",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return m1ErrorResponse(error);
  }
}
