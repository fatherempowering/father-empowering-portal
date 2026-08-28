import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { M1ContractError } from "@/lib/contracts/m1";

export function m1ErrorResponse(error: unknown) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
  };

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Invalid request." } },
      { status: 400, headers },
    );
  }

  if (!(error instanceof M1ContractError)) {
    return NextResponse.json(
      { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Service temporarily unavailable." } },
      { status: 503, headers },
    );
  }

  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers },
  );
}
