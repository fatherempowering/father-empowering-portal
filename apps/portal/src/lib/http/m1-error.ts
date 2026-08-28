import { NextResponse } from "next/server";

import { M1ContractError } from "@/lib/contracts/m1";

export function m1ErrorResponse(error: unknown) {
  if (!(error instanceof M1ContractError)) {
    return NextResponse.json(
      { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Service temporarily unavailable." } },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}
