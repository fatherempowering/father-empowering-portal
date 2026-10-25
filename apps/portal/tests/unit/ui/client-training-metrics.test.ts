import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { publicationSchema, type ProgramPublication } from "@/lib/contracts/training-publication";
import type { WorkoutSetResult, WorkoutSnapshot } from "@/lib/contracts/training-results";
import { calculateClientWeekMetrics, readClientWeekMetrics, ClientTrainingMetricsContent } from "@/features/training/client/client-training-metrics";
import { pilotResultExercise } from "../training/pilot-result-fixture";

Object.assign(globalThis, { React });
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function program(sessionCount = 1): ProgramPublication {
  return publicationSchema.parse({
    id: id(1), clientId: id(2), programId: id(3), draftVersion: 1, revision: 1, publishedAt: "2026-10-25T12:00:00Z",
    document: { schemaVersion: 1, phaseId: id(4), title: { fr: "Programme test", en: "Test program" }, weeks: [{ number: 1, objective: { fr: "", en: "" },
      sessions: Array.from({ length: sessionCount }, (_, index) => ({ id: id(100 + index), title: { fr: `Séance ${index + 1}`, en: `Session ${index + 1}` },
        type: "training", required: true, schedule: { mode: "flexible", day: null }, warmup: { fr: "", en: "" },
        blocks: [{ id: id(200 + index), label: { fr: "", en: "" }, mode: "standard", restSeconds: 60,
          exercises: ["lb", "kg", "sec", "distance", "configuration"].map((unit, n) => {
            const exercise = unit === "configuration" ? pilotResultExercise("BA_027") : { id: id(1), libraryExerciseId: id(2), name: `Exercice ${unit}`, cue: { fr: "", en: "" }, media: null,
              prescription: { sets: 3, reps: "8", targetRir: 2, restSeconds: 60, tempo: "", loadTarget: "999", unit } };
            return { ...exercise, id: id(1_000 + index * 10 + n), libraryExerciseId: id(3_000 + index * 10 + n) };
          }) }],
      })),
    }] },
  });
}
function set(p: ProgramPublication, unit: WorkoutSetResult["unit"], overrides: Partial<WorkoutSetResult> = {}, sessionIndex = 0): WorkoutSetResult {
  const exercise = p.document.weeks[0].sessions[sessionIndex].blocks[0].exercises.find(x => x.prescription.unit === unit)!;
  return { exerciseId: exercise.id, setNumber: 1, status: "DONE", reps: unit === "lb" || unit === "kg" || unit === "configuration" ? 8 : null,
    load: unit === "configuration" ? null : 20, rir: null, kind: "PRESCRIBED", unit, ...(unit === "configuration" ? { details: "Bande test" } : {}), ...overrides };
}
function workout(p: ProgramPublication, sets: WorkoutSetResult[], sessionIndex = 0): WorkoutSnapshot {
  const session = p.document.weeks[0].sessions[sessionIndex];
  return { id: id(5_000 + sessionIndex), publicationId: p.id, weekNumber: 1, sessionId: session.id, version: 1, status: "IN_PROGRESS", sets,
    note: null, startedAt: "2026-10-25T12:00:00Z", updatedAt: "2026-10-25T12:01:00Z", completedAt: null, programTitle: p.document.title, publicationRevision: 1, session };
}
function payload(p: ProgramPublication, result: WorkoutSnapshot | null) {
  const wire = structuredClone(result);
  if (wire) Reflect.deleteProperty(wire, "session");
  return { data: { publication: p, workout: wire } };
}
function calculate(p: ProgramPublication, result: WorkoutSnapshot | null) {
  return calculateClientWeekMetrics(p.document.weeks[0], [{ sessionId: p.document.weeks[0].sessions[0].id, workout: result }]);
}

describe("Client weekly training metrics — real recorded mass only", () => {
  it("sums actual DONE mass results by unit, includes extras, and excludes pending/skipped/configuration/time/distance", () => {
    const p = program();
    const result = calculate(p, workout(p, [
      set(p, "lb", { reps: 8, load: 20 }),
      set(p, "lb", { reps: 5, load: 10, setNumber: 4, kind: "EXTRA" }),
      set(p, "lb", { status: "PENDING", reps: null, load: null, setNumber: 2 }),
      set(p, "lb", { status: "SKIPPED", reps: null, load: null, setNumber: 3 }),
      set(p, "kg", { reps: 4, load: 5 }),
      set(p, "sec", { load: 60 }), set(p, "distance", { load: 200 }), set(p, "configuration"),
    ]));
    expect(result.units.lb).toEqual({ volume: 210, totalLoad: 30, measuredSets: 2 });
    expect(result.units.kg).toEqual({ volume: 20, totalLoad: 5, measuredSets: 1 });
    expect(result.measuredSets).toBe(3);
    expect(result.units.lb.totalLoad).not.toBe(999);
  });

  it("does not double unilateral/per-arm repetitions or implement masses", () => {
    const p = program(); const exercise = pilotResultExercise(); exercise.prescription.sets = 3;
    p.document.weeks[0].sessions[0].blocks[0].exercises = [exercise];
    const result = calculate(p, workout(p, [{ exerciseId: exercise.id, setNumber: 1, kind: "PRESCRIBED", status: "DONE", reps: 8, load: 20, unit: "lb", rir: null }]));
    expect(result.units.lb).toEqual({ volume: 160, totalLoad: 20, measuredSets: 1 });
  });

  it("distinguishes genuine zero measurements from an unknown/unstarted result", () => {
    const p = program();
    expect(calculate(p, null).units.lb).toEqual({ volume: null, totalLoad: null, measuredSets: 0 });
    expect(calculate(p, workout(p, [set(p, "lb", { load: 0, reps: 8 })])).units.lb).toEqual({ volume: 0, totalLoad: 0, measuredSets: 1 });
    expect(calculate(p, workout(p, [set(p, "lb", { load: 10, reps: 0 })])).units.lb).toEqual({ volume: 0, totalLoad: 10, measuredSets: 1 });
  });

  it("has no numeric mass metric when only pending/skipped or nonmass results exist", () => {
    const p = program();
    const result = calculate(p, workout(p, [set(p, "lb", { status: "PENDING", reps: null, load: null }), set(p, "kg", { status: "SKIPPED", reps: null, load: null }), set(p, "sec")]));
    expect(result.measuredSets).toBe(0);
    expect(result.units.lb.volume).toBeNull(); expect(result.units.kg.totalLoad).toBeNull();
  });

  it("rejects duplicated sets, missing readings, invalid numeric results and cross-session observations", () => {
    const p = program(); const done = set(p, "lb");
    expect(() => calculate(p, workout(p, [done, done]))).toThrow();
    expect(() => calculateClientWeekMetrics(p.document.weeks[0], [])).toThrow();
    expect(() => calculate(p, workout(p, [set(p, "lb", { load: null })]))).toThrow();
    expect(() => calculate(p, { ...workout(p, [done]), sessionId: id(999) })).toThrow();
    expect(() => calculate(p, { ...workout(p, [done]), weekNumber: 2 })).toThrow();
  });

  it("reads only the own Client session API and validates publication/week/session identity", async () => {
    const p = program(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload(p, workout(p, [set(p, "lb")]))));
    const signal = new AbortController().signal;
    const result = await readClientWeekMetrics(p, p.document.weeks[0], signal, fetcher);
    expect(result.units.lb.volume).toBe(160);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/v1/client/workouts/session?publicationId=${p.id}&weekNumber=1&sessionId=${p.document.weeks[0].sessions[0].id}`, { cache: "no-store", credentials: "same-origin", redirect: "error", signal });
  });

  it("keeps at most three network requests active across a longer week", async () => {
    const p = program(7); let active = 0; let peak = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return Response.json(payload(p, null));
    });
    const result = await readClientWeekMetrics(p, p.document.weeks[0], new AbortController().signal, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(7); expect(peak).toBe(3);
    expect(result.sessions).toHaveLength(7); expect(result.units.lb.volume).toBeNull();
  });

  it.each([401, 403])("treats HTTP %i as authentication required without provider error disclosure", async status => {
    const p = program(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "PRIVATE_PROVIDER_DETAILS" }, { status }));
    await expect(readClientWeekMetrics(p, p.document.weeks[0], new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "AUTH_REQUIRED", message: "AUTH_REQUIRED" });
  });

  it.each(["publication", "client", "revision", "week", "session"])("refuses a successful HTTP response for a different %s", async kind => {
    const p = program(2); const changed = structuredClone(p);
    if (kind === "publication") changed.id = id(999);
    if (kind === "client") changed.clientId = id(999);
    if (kind === "revision") changed.revision = 2;
    if (kind === "week") changed.document.weeks[0].objective.fr = "Different immutable week";
    const result = kind === "session" ? workout(p, [set(p, "lb", {}, 1)], 1) : null;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload(changed, result)));
    await expect(readClientWeekMetrics(p, p.document.weeks[0], new AbortController().signal, fetcher)).rejects.toBeDefined();
  });

  it("does not manufacture zero or partial totals after a network/server error or cancellation", async () => {
    const p = program(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("PRIVATE_DETAIL", { status: 503 }));
    await expect(readClientWeekMetrics(p, p.document.weeks[0], new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const controller = new AbortController(); controller.abort(); const never = vi.fn<typeof fetch>();
    await expect(readClientWeekMetrics(p, p.document.weeks[0], controller.signal, never)).rejects.toMatchObject({ name: "AbortError" });
    expect(never).not.toHaveBeenCalled();
  });

  it("renders only measured bars, separated mass units and explicit provenance", () => {
    const p = program(); const metrics = calculate(p, workout(p, [set(p, "lb", { load: 0 }), set(p, "kg", { load: 10, reps: 5 })]));
    const html = renderToStaticMarkup(React.createElement(ClientTrainingMetricsContent, { metrics, weekNumber: 1, french: true, onRetry: () => {} }));
    expect(html).toContain("Semaine 1 · 2 séries mesurées"); expect(html).toContain("kg"); expect(html).toContain("lb");
    expect(html).toContain("Aucun doublement par bras"); expect(html).toContain("Les lb et kg restent séparés");
    expect(html).toContain('height:0%'); expect(html).toContain('height:100%');
    expect(html).not.toContain("Indisponible");
  });

  it("renders unknown/error states without fake graph bars or a false zero total", () => {
    const p = program(); const empty = calculate(p, null);
    const html = renderToStaticMarkup(React.createElement(ClientTrainingMetricsContent, { metrics: empty, weekNumber: 1, french: false, onRetry: () => {} }));
    expect(html).toContain("No recorded mass-based set"); expect(html).not.toContain('class="_bar_'); expect(html).not.toContain("height:");
    const failed = renderToStaticMarkup(React.createElement(ClientTrainingMetricsContent, { metrics: null, weekNumber: 1, french: true, failed: true, onRetry: () => {} }));
    expect(failed).toContain("Indisponible"); expect(failed).toContain("Réessayer"); expect(failed).not.toContain("height:");
  });

  it("retains cancellation/deadline, no-cache reads and no new backend/secret access", () => {
    const source = readFileSync("src/features/training/client/client-training-metrics.tsx", "utf8");
    expect(source).toContain("setTimeout(() => controller.abort(), 8_000)");
    expect(source).toContain("Math.min(3, selectedWeek.sessions.length)");
    expect(source).toContain('window.location.assign("/client-login")');
    expect(source).not.toMatch(/service_role|SUPABASE_|localStorage|\/api\/v1\/coach|\.rpc\(/);
  });

  it("uses the registered body font and readable mobile labels and explanatory text", () => {
    const css = readFileSync("src/features/training/client/client-training-metrics.module.css", "utf8");
    expect(css).toContain('font-family: "FE Sans", "DM Sans", sans-serif');
    expect(css).toContain("@media (max-width: 759px)");
    expect(css).toContain(".header > span, .chartUnit, .barValue, .barLabel { font-size: 12px; }");
    expect(css).toContain(".subtitle, .empty, .method, .auth { font-size: 13px; }");
  });
});
