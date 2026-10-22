import { NextResponse } from "next/server";
import { uuidSchema } from "@/lib/contracts/m1";
import { saveWorkoutRequestSchema, workoutSelectorSchema, workoutListQuerySchema } from "@/lib/contracts/training-results";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { listOwnWorkouts, listCoachWorkouts, readOwnWorkout, readCoachWorkout, saveOwnWorkout } from "@/lib/training/workout-repository";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export async function clientWorkoutsHttp(request: Request) {
  try {
    const { page } = workoutListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listOwnWorkouts(page) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function clientWorkoutHttp(request: Request) {
  try {
    const selector = workoutSelectorSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await readOwnWorkout(selector) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function saveWorkoutHttp(request: Request) {
  try {
    requireSameOrigin(request);
    const input = saveWorkoutRequestSchema.parse(await readJsonObjectWithLimit(request, 4_194_304));
    return NextResponse.json({ data: { workout: await saveOwnWorkout(input) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function coachWorkoutsHttp(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const id = uuidSchema.parse((await context.params).clientId);
    const { page } = workoutListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listCoachWorkouts(id, page) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
export async function coachWorkoutHttp(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const id = uuidSchema.parse((await context.params).clientId);
    const selector = workoutSelectorSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await readCoachWorkout(id, selector) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
