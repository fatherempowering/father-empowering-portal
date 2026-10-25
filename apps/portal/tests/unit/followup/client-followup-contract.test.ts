import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_NUTRITION_DOCUMENT, checkInDateSchema, checkInDocumentSchema, checkInMutationSchema, emptyCheckInDocument, nutritionDocumentSchema, nutritionMutationSchema, publishableCheckInDocumentSchema, publishableNutritionDocumentSchema } from "@/lib/contracts/client-followup";

const mutationId = "10000000-0000-4000-8000-000000000001";
describe("Native follow-up contracts", () => {
  it("allows private incomplete drafts without inventing any targets or measurements", () => {
    expect(nutritionDocumentSchema.parse(EMPTY_NUTRITION_DOCUMENT).targets.calories).toBeNull();
    expect(checkInDocumentSchema.parse(emptyCheckInDocument("2026-01-01")).measurements.bodyWeightLb).toBeNull();
    expect(publishableNutritionDocumentSchema.safeParse(EMPTY_NUTRITION_DOCUMENT).success).toBe(false);
    expect(publishableCheckInDocumentSchema.safeParse(emptyCheckInDocument("2026-01-01")).success).toBe(false);
  });
  it("requires measured weight and sleep only at submission, with actionable field paths", () => {
    const document = emptyCheckInDocument("2026-01-01"); document.notes = "An observation";
    const result = publishableCheckInDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path.join("."))).toEqual(["measurements.bodyWeightLb", "sleepHours"]);
    document.measurements.bodyWeightLb = 180; document.sleepHours = 0;
    expect(publishableCheckInDocumentSchema.safeParse(document).success).toBe(true);
  });
  it("rejects invalid/future calendar dates without turning a schedule into a measurement", () => {
    for (const date of ["2026-02-30", "2026-2-01", "1999-12-31", "2101-01-01", "invalid"]) expect(checkInDateSchema.safeParse(date).success).toBe(false);
    expect(checkInDateSchema.safeParse("2024-02-29").success).toBe(true);
    const future = emptyCheckInDocument("2100-01-01"); future.measurements.bodyWeightLb = 180; future.sleepHours = 7;
    expect(publishableCheckInDocumentSchema.safeParse(future).success).toBe(false);
  });
  it("requires an actual nutrition title and portion without forcing calorie targets", () => {
    const document = structuredClone(EMPTY_NUTRITION_DOCUMENT);
    document.title.fr = "Plan prescrit";
    document.meals.push({ id: mutationId, title: { fr: "Déjeuner", en: "" }, portions: { fr: "Portion prescrite par le Coach", en: "" }, notes: { fr: "", en: "" } });
    expect(publishableNutritionDocumentSchema.safeParse(document).success).toBe(true);
    document.meals[0].portions.fr = "";
    expect(publishableNutritionDocumentSchema.safeParse(document).success).toBe(false);
  });
  it("validates all bilateral measurements, numeric bounds, scores and unknown fields", () => {
    const document = emptyCheckInDocument("2026-01-01");
    document.measurements.leftArmIn = 13; document.measurements.rightArmIn = 14;
    document.measurements.leftCalfIn = 15; document.measurements.rightCalfIn = 16;
    expect(checkInDocumentSchema.parse(document).measurements.leftArmIn).toBe(13);
    for (const bad of [{ ...document, sleepHours: 25 }, { ...document, energy: 0 }, { ...document, stress: 1.5 }, { ...document, cardioMinutes: -1 }, { ...document, cardioZone: 6 }, { ...document, extra: true }]) expect(checkInDocumentSchema.safeParse(bad).success).toBe(false);
    expect(checkInDocumentSchema.safeParse({ ...document, measurements: { ...document.measurements, bodyWeightLb: 0 } }).success).toBe(false);
  });
  it("does not accept a client-selected identity or privileged fields in mutation bodies", () => {
    expect(checkInMutationSchema.safeParse({ action: "submit", expectedVersion: 2, clientMutationId: mutationId }).success).toBe(true);
    expect(checkInMutationSchema.safeParse({ action: "submit", expectedVersion: 2, clientMutationId: mutationId, clientId: mutationId }).success).toBe(false);
    expect(nutritionMutationSchema.safeParse({ action: "publish", expectedVersion: 2, expectedPublicationId: null, clientMutationId: mutationId, publishedBy: mutationId }).success).toBe(false);
    expect(nutritionMutationSchema.safeParse({ action: "publish", expectedVersion: 0, expectedPublicationId: null, clientMutationId: mutationId }).success).toBe(false);
  });
  it("has no service role, health score, invented workout dates or external prescription in its repository", () => {
    const source = readFileSync("src/lib/followup/followup-repository.ts", "utf8");
    expect(source).not.toMatch(/createAdminSupabaseClient|service_role|SUPABASE_SERVICE/);
    expect(source).toContain('.eq("status", "COMPLETED")');
    expect(source).toContain('.not("completed_at", "is", null)');
    expect(source).toContain('count: "exact"');
    expect(source).toContain("checkInsTruncated");
  });
});
