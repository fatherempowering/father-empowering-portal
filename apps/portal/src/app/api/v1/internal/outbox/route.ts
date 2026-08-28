import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getOutboxWorkerEnvironment } from "@/lib/env";
import { m1OutboxHandlers } from "@/lib/outbox/invitation-delivery";
import { processOutboxBatch } from "@/lib/outbox/worker";

export const runtime = "nodejs";

function authorized(request: Request, expected: string) {
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const environment = getOutboxWorkerEnvironment();
  if (!authorized(request, environment.OUTBOX_WORKER_SECRET)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const outcomes = await processOutboxBatch(m1OutboxHandlers);
  return NextResponse.json({ processed: outcomes.length, outcomes });
}
