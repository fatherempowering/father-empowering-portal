import { NextResponse } from "next/server";

import { exerciseListQuerySchema, saveExerciseRequestSchema } from "@/lib/contracts/training";
import { readJsonObjectWithLimit } from "@/lib/http/json-body";
import { m1ErrorResponse } from "@/lib/http/m1-error";
import { requireSameOrigin } from "@/lib/http/origin";
import { listTrainingExercises, saveTrainingExercise } from "@/lib/training/exercise-repository";

const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" };

export async function listExercisesHttp(request: Request) {
  try {
    const input = exerciseListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listTrainingExercises(input) }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}

export async function saveExerciseHttp(request: Request) {
  try {
    requireSameOrigin(request);
    const input = saveExerciseRequestSchema.parse(await readJsonObjectWithLimit(request, 8_192));
    return NextResponse.json({ data: { exercise: await saveTrainingExercise(input) } }, { headers });
  } catch (error) { return m1ErrorResponse(error); }
}
