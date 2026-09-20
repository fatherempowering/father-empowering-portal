import { NextResponse } from "next/server";

import {
  exchangeStaffPasswordRecoveryCode,
} from "@/lib/auth/staff-password-recovery";
import {
  issueStaffPasswordRecoveryGrant,
  STAFF_PASSWORD_RECOVERY_COOKIE,
  STAFF_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
} from "@/lib/auth/staff-password-recovery-grant";
import { getPublicEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";

function redirectResponse(path: string): NextResponse {
  const environment = getPublicEnvironment();
  return NextResponse.redirect(new URL(path, environment.NEXT_PUBLIC_APP_URL), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  if (!code || next !== "/reset-password") {
    return redirectResponse("/login?error=recovery");
  }

  try {
    const { requiresMfa, ...identity } =
      await exchangeStaffPasswordRecoveryCode(code);
    const response = redirectResponse(
      requiresMfa ? "/mfa?next=%2Freset-password" : "/reset-password",
    );
    const canonicalUrl = new URL(getPublicEnvironment().NEXT_PUBLIC_APP_URL);
    response.cookies.set(
      STAFF_PASSWORD_RECOVERY_COOKIE,
      issueStaffPasswordRecoveryGrant(identity),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: canonicalUrl.protocol === "https:",
        path: "/",
        maxAge: STAFF_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
      },
    );
    return response;
  } catch {
    return redirectResponse("/login?error=recovery");
  }
}
