import { NextResponse } from "next/server";
import { uuidSchema } from "@/lib/contracts/m1";
import { programListQuerySchema, saveProgramRequestSchema } from "@/lib/contracts/training-drafts";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { getProgramDraft, listProgramDrafts, saveProgramDraft } from "@/lib/training/program-repository";
const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export async function listProgramsHttp(request: Request) {
  try {
    const { page } = programListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listProgramDrafts(page) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function getProgramHttp(_request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const id = uuidSchema.parse((await context.params).programId);
    return NextResponse.json({ data: { program: await getProgramDraft(id) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function saveProgramHttp(request: Request) {
  try {
    requireSameOrigin(request);
    const input = saveProgramRequestSchema.parse(await readJsonObjectWithLimit(request, 600_000));
    return NextResponse.json({ data: { program: await saveProgramDraft(input) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
