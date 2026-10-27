import { NextResponse } from "next/server";
import { uuidSchema } from "@/lib/contracts/m1";
import { programListQuerySchema } from "@/lib/contracts/training-drafts";
import { publishProgramRequestSchema, withdrawProgramRequestSchema } from "@/lib/contracts/training-publication";
import { readM1JsonObject } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { listTrainingRecipients, publishProgram, readCoachPublication, readOwnPublication, withdrawProgram } from "@/lib/training/publication-repository";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export async function recipientsHttp(request: Request) {
  try {
    const { page } = programListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listTrainingRecipients(page) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function coachPublicationHttp(_request: Request, context: { params: Promise<{ clientId: string }> }) {
  try { return NextResponse.json({ data: { program: await readCoachPublication(uuidSchema.parse((await context.params).clientId)) } }, { headers }); }
  catch (error) { return m1ErrorResponse(error); }
}
export async function clientPublicationHttp() {
  try { return NextResponse.json({ data: { program: await readOwnPublication() } }, { headers }); }
  catch (error) { return m1ErrorResponse(error); }
}
export async function publishProgramHttp(request: Request) {
  try {
    requireSameOrigin(request);
    const input = publishProgramRequestSchema.parse(await readM1JsonObject(request));
    return NextResponse.json({ data: { program: await publishProgram(input) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function withdrawProgramHttp(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    requireSameOrigin(request);
    const clientId = uuidSchema.parse((await context.params).clientId);
    const input = withdrawProgramRequestSchema.parse(await readM1JsonObject(request));
    return NextResponse.json({ data: { program: await withdrawProgram(clientId, input) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
