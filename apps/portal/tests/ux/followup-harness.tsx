// Browser-memory fixtures only. Never imported by application routes.
import { checkInMutationSchema, emptyCheckInDocument, EMPTY_CHECK_IN_MEASUREMENTS, nutritionMutationSchema, publishableCheckInDocumentSchema, publishableNutritionDocumentSchema, type CheckInSubmission, type NutritionPublication, type NutritionDocument } from "../../src/lib/contracts/client-followup";
export { ClientNutrition } from "../../src/features/followup/client/client-nutrition";
export { ClientCheckIn } from "../../src/features/followup/client/client-check-in";
export { ClientProgression } from "../../src/features/followup/client/client-progression";

const CLIENT = "76000000-0000-4000-8000-000000000010";
const stamp = "2026-10-25T12:00:00.000Z";
const pair = (fr: string, en = fr) => ({ fr, en });
const uuid = (value: number) => `76000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const plan = (): NutritionDocument => ({
  title: pair("Plan test — régulier", "Test plan — regular"), targets: { calories: 2400, proteinG: 180, carbohydrateG: 240, fatG: null },
  meals: [{ id: uuid(21), title: pair("Poulet, riz et légumes", "Chicken, rice and vegetables"), timeLabel: pair("12:00 · Dîner", "12:00 · Lunch"), portions: pair("Poulet : 150 g cuits\nRiz : 180 g cuits\nLégumes : portion du plan", "Chicken: 150 g cooked\nRice: 180 g cooked\nVegetables: prescribed portion"), notes: pair("Suis les portions prescrites.", "Follow the prescribed portions.") }],
  instructions: pair("Les portions sont celles de ce plan.", "Portions belong to this plan."), preparation: pair("Prépare les aliments indiqués dans les repas.", "Prepare the ingredients listed in the meals."), grocery: pair("Poulet\nRiz\nLégumes", "Chicken\nRice\nVegetables"),
});
function submission(id: number, date: string, weight: number, submittedAt = stamp): CheckInSubmission {
  return { id: uuid(id), clientId: CLIENT, submittedAt, document: { ...emptyCheckInDocument(date), sleepHours: 7, energy: 6, cardioMinutes: 0, measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: weight, waistIn: 37, leftArmIn: 14, rightArmIn: 14.5, leftCalfIn: 15, rightCalfIn: 15.5 } } };
}

export function setupFollowupHarness(scenario: string | (() => string), fallbackFetch: typeof fetch): typeof fetch {
  let previous = "", version = 0, draft: { version: number; document: ReturnType<typeof emptyCheckInDocument>; updatedAt: string } | null = null;
  let history: CheckInSubmission[] = [], nutritionDraft: { version: number; document: NutritionDocument; updatedAt: string } | null = null, nutrition: NutritionPublication | null = null, nutritionHistory: NutritionPublication[] = [];
  let requests: unknown[] = [], failedOnce = false, responseLost = false, conflict = false;
  const cache = new Map<string, { body: string; data: unknown }>();
  function reset(state: string) {
    previous = state; version = 0; draft = null; history = []; nutritionDraft = null; nutrition = null; nutritionHistory = []; requests = []; failedOnce = false; responseLost = false; conflict = false; cache.clear();
    if (state.startsWith("followup-") && !["followup-empty", "followup-error", "followup-error-once", "followup-denied", "followup-response-lost", "followup-conflict"].includes(state)) {
      const document = plan();
      if (state === "followup-absent-sections") { document.preparation = pair(""); document.grocery = pair(""); }
      nutrition = { id: uuid(30), clientId: CLIENT, revision: 2, draftVersion: 2, document, publishedAt: stamp };
      nutritionHistory = [{ ...nutrition, id: uuid(31), revision: 1, draftVersion: 1, document: { ...plan(), title: pair("Ancien plan", "Previous plan"), targets: { calories: 2200, proteinG: 160, carbohydrateG: 200, fatG: 70 } }, publishedAt: "2026-10-01T12:00:00.000Z" }];
      nutritionDraft = { version: 2, document: structuredClone(document), updatedAt: stamp };
      if (state === "followup-withdrawn") { nutritionHistory.unshift({ ...nutrition, withdrawnAt: stamp }); nutrition = null; }
      if (state !== "followup-single") history = [submission(40, "2026-10-25", 180), submission(41, "2026-10-10", 184, "2026-10-11T12:00:00.000Z")];
      if (state === "followup-many") history = Array.from({ length: 53 }, (_, index) => submission(100 + index, new Date(Date.UTC(2026, 9, 25 - index)).toISOString().slice(0, 10), 180 + index / 10));
      version = history.length;
    }
    (window as unknown as { __followupCommands: unknown[] }).__followupCommands = requests;
  }
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data } : { error: { code: "TEST_RESPONSE" } }), { status, headers: { "content-type": "application/json" } });
  const checkInsData = (page = 0, coach = false) => ({ ...(coach ? {} : { version, draft: structuredClone(draft) }), history: structuredClone(history.slice(page * 50, page * 50 + 50)), historyTruncated: history.length > (page + 1) * 50, page, total: history.length });
  const nutritionData = (coach = false) => ({ ...(coach ? { draft: structuredClone(nutritionDraft) } : {}), publication: structuredClone(nutrition), history: structuredClone(nutritionHistory), historyTruncated: false });
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const coach = url.pathname.startsWith(`/api/v1/coach/clients/${CLIENT}/`);
    const isNutrition = url.pathname === "/api/v1/client/nutrition" || coach && url.pathname.endsWith("/nutrition");
    const isCheckIn = url.pathname === "/api/v1/client/check-ins" || coach && url.pathname.endsWith("/check-ins");
    const isProgress = url.pathname === "/api/v1/client/progression";
    if (!isNutrition && !isCheckIn && !isProgress) return fallbackFetch(input, init);
    const state = typeof scenario === "function" ? scenario() : scenario;
    if (state !== previous) reset(state);
    if (state === "followup-denied") return response(null, 401);
    if (state === "followup-error" || state === "followup-error-once" && !failedOnce) { failedOnce = true; return response(null, 503); }
    const post = init?.method === "POST";
    if (!post) {
      if (isNutrition) return response(nutritionData(coach));
      if (isCheckIn) return response(checkInsData(Number(url.searchParams.get("page") ?? 0), coach));
      const filled = state.startsWith("followup-") && !["followup-empty", "followup-error", "followup-error-once", "followup-denied"].includes(state);
      return response({ baseline: filled ? { source: "WEEK_ZERO", recordedAt: "2026-10-01T12:00:00.000Z", measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 190, waistIn: 39, leftArmIn: 13, rightArmIn: 13.5 } } : null, checkIns: structuredClone(history), checkInsTruncated: false, checkInsTotal: history.length, completedWorkouts: { total: filled ? 18 : 0, dates: filled ? [stamp] : [], datesTruncated: false } });
    }
    const body = JSON.parse(String(init?.body ?? "{}")); requests.push(structuredClone(body));
    const known = cache.get(body.clientMutationId);
    if (known) return known.body === JSON.stringify(body) ? response(known.data) : response(null, 409);
    if (state === "followup-conflict" && !conflict) { conflict = true; version += 1; return response(null, 409); }
    if (isCheckIn && !coach) {
      const parsed = checkInMutationSchema.safeParse(body);
      if (!parsed.success) return response(null, 400);
      if (parsed.data.expectedVersion !== version) return response(null, 409);
      if (parsed.data.action === "save") { version += 1; draft = { version, document: structuredClone(parsed.data.document), updatedAt: stamp }; }
      else {
        if (!draft || !publishableCheckInDocumentSchema.safeParse(draft.document).success) return response(null, 400);
        history = [{ id: uuid(500 + history.length), clientId: CLIENT, submittedAt: stamp, document: structuredClone(draft.document) }, ...history]; version += 1; draft = null;
      }
      const data = checkInsData(); cache.set(body.clientMutationId, { body: JSON.stringify(body), data: structuredClone(data) });
      if (state === "followup-response-lost" && !responseLost) { responseLost = true; throw new TypeError("Synthetic response loss"); }
      return response(data);
    }
    if (isNutrition && coach) {
      const parsed = nutritionMutationSchema.safeParse(body);
      if (!parsed.success) return response(null, 400);
      if (parsed.data.action !== "withdraw" && parsed.data.expectedVersion !== (nutritionDraft?.version ?? 0)) return response(null, 409);
      if (parsed.data.action === "save") nutritionDraft = { version: (nutritionDraft?.version ?? 0) + 1, document: structuredClone(parsed.data.document), updatedAt: stamp };
      else if (parsed.data.action === "withdraw") {
        if (!nutrition || parsed.data.expectedPublicationId !== nutrition.id) return response(null, 409);
        nutritionHistory.unshift({ ...structuredClone(nutrition), withdrawnAt: stamp }); nutrition = null;
      }
      else {
        if (!nutritionDraft || !publishableNutritionDocumentSchema.safeParse(nutritionDraft.document).success) return response(null, 400);
        if (parsed.data.expectedPublicationId !== (nutrition?.id ?? null)) return response(null, 409);
        if (nutrition) nutritionHistory.unshift(structuredClone(nutrition));
        nutrition = { id: uuid(600 + nutritionHistory.length), clientId: CLIENT, revision: (nutrition?.revision ?? 0) + 1, draftVersion: nutritionDraft.version, document: structuredClone(nutritionDraft.document), publishedAt: stamp };
      }
      const data = nutritionData(true); cache.set(body.clientMutationId, { body: JSON.stringify(body), data: structuredClone(data) });
      return response(data);
    }
    return response(null, 405);
  };
}
