import { NextResponse } from "next/server";
import { uuidSchema } from "@/lib/contracts/m1";
import { programListQuerySchema } from "@/lib/contracts/training-drafts";
import { programVersionSchema } from "@/lib/contracts/training-history";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { getProgramHistoryVersion, listProgramHistory } from "@/lib/training/history-repository";
const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export async function listHistoryHttp(request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const id = uuidSchema.parse((await context.params).programId);
    const { page } = programListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listProgramHistory(id, page) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function getHistoryVersionHttp(_request: Request, context: { params: Promise<{ programId: string; version: string }> }) {
  try {
    const params = await context.params; const id = uuidSchema.parse(params.programId); const version = programVersionSchema.parse(params.version);
    return NextResponse.json({ data: { program: await getProgramHistoryVersion(id, version) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
