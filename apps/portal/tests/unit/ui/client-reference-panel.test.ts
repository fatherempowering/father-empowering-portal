import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ClientReferencePanel,
  ClientReferencePanelContent,
  clientReferenceMeasurements,
  readClientReference,
  readClientReferencePhoto,
} from "@/features/training/client/client-reference-panel";
import { EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES, type WeekZeroAcquisitionSnapshot } from "@/lib/contracts/week-zero-acquisition";

Object.assign(globalThis, { React });
const assetId = "11111111-1111-4111-8111-111111111111";
function fixture(): WeekZeroAcquisitionSnapshot {
  const responses = structuredClone(EMPTY_WEEK_ZERO_ACQUISITION_RESPONSES);
  responses.measurements = { ...responses.measurements, bodyWeightLb: 185.5, waistIn: 34, leftArmIn: 14.25, rightArmIn: 14.5, leftCalfIn: 15, rightCalfIn: 15.5 };
  return { kind: "WEEK_ZERO_ACQUISITION", schemaVersion: 1, version: 2, status: "DRAFT", responses, derived: { cardio: null }, updatedAt: "2026-10-25T12:00:00Z", submittedAt: null };
}
function render(snapshot: WeekZeroAcquisitionSnapshot | null, french = true) {
  return renderToStaticMarkup(React.createElement(ClientReferencePanelContent, { french, snapshot, onRetry: () => {}, onAuthRequired: () => {} }));
}

describe("Legacy Client reference sidebar", () => {
  it("renders six honest check-in placeholders and does not promote Week Zero data into a latest check-in", () => {
    const html = render(fixture());
    expect(html.match(/data-testid="reference-checkin-kpi"/g)).toHaveLength(6);
    const lastCheckin = html.slice(0, html.indexOf("Mensurations de départ"));
    expect(lastCheckin).toContain("Chargement du dernier check-in");
    expect(lastCheckin).not.toContain("185");
    for (const label of ["Poids", "Sommeil", "Énergie", "Stress", "Courbatures", "Cardio"]) expect(lastCheckin).toContain(label);
    expect(html).toContain("Semaine zéro · brouillon enregistré");
    expect(html).toContain("185,5");
    expect(html).not.toContain("VO₂");
  });

  it("preserves actual optional left/right measures and leaves missing values blank rather than inventing zero", () => {
    const result = clientReferenceMeasurements(fixture(), true);
    expect(result.find(row => row.label === "Bras gauche")).toEqual({ label: "Bras gauche", value: "14,25", unit: "po" });
    expect(result.find(row => row.label === "Bras droit")?.value).toBe("14,5");
    expect(result.find(row => row.label === "Mollet gauche")?.value).toBe("15");
    expect(result.find(row => row.label === "Mollet droit")?.value).toBe("15,5");
    expect(result.find(row => row.label === "Tour de poitrine")?.value).toBe("—");
    expect(clientReferenceMeasurements(null, true).every(row => row.value === "—")).toBe(true);
    const legacy = fixture(); delete legacy.responses.measurements.leftArmIn;
    expect(clientReferenceMeasurements(legacy, false).find(row => row.label === "Left arm")?.value).toBe("—");
  });

  it("keeps provenance and labels bilingual and does not fabricate progression photos", () => {
    const snapshot = fixture(); snapshot.status = "SUBMITTED";
    const html = render(snapshot, false);
    expect(html).toContain("Reference · Week Zero");
    expect(html).toContain("Starting bodyweight");
    expect(html).toContain("185.5");
    expect(html).toContain("private photos");
    expect(html.match(/Not added/g)).toHaveLength(3);
    expect(html).not.toMatch(/<img\b|<video\b|<iframe\b/);
    expect(html).toContain('href="/client/week-zero"');
  });

  it("exports the requested accessible panel and a loading state without simulated values", () => {
    const html = renderToStaticMarkup(React.createElement(ClientReferencePanel, { french: true }));
    expect(html).toContain('data-testid="client-reference-panel"');
    expect(html).toContain('aria-label="Mes repères"');
    expect(html).toContain("Chargement de tes repères");
    expect(html).not.toContain("Non ajoutée");
    expect(html).not.toContain("185");
  });

  it("reads and validates only the authenticated own-client snapshot with cancellation and no cache", async () => {
    const snapshot = fixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { acquisition: snapshot } }));
    const signal = new AbortController().signal;
    expect(await readClientReference(signal, fetcher)).toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/client/week-zero/acquisition", { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
  });

  it.each([401, 403])("denies status %i without reading or exposing an error response body", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "PRIVATE_PROVIDER_DETAIL" }, { status }));
    await expect(readClientReference(new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "AUTH_REQUIRED", message: "AUTH_REQUIRED" });
  });

  it("fails closed on invalid data or a server/network error", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(Response.json({ data: { acquisition: { ...fixture(), status: "UNKNOWN" } } }));
    await expect(readClientReference(new AbortController().signal, fetcher)).rejects.toBeDefined();
    fetcher.mockResolvedValueOnce(Response.json({ message: "PRIVATE_PROVIDER_DETAIL" }, { status: 503 }));
    await expect(readClientReference(new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "UNAVAILABLE", message: "UNAVAILABLE" });
    fetcher.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    await expect(readClientReference(new AbortController().signal, fetcher)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("loads photos from the authorized own-client route, with no client ID or public storage URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { "Content-Type": "image/jpeg" } }));
    const signal = new AbortController().signal;
    const blob = await readClientReferencePhoto("front", assetId, signal, fetcher);
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(3);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/v1/client/week-zero/photos?slot=front&assetId=${assetId}`, { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
    const invalid = vi.fn<typeof fetch>();
    await expect(readClientReferencePhoto("front", "../../another-client", signal, invalid)).rejects.toBeDefined();
    expect(invalid).not.toHaveBeenCalled();
  });

  it.each([401, 403])("photo status %i also requires authentication, never public fallback", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("PRIVATE_PHOTO_DETAIL", { status }));
    await expect(readClientReferencePhoto("back", assetId, new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it.each([
    new Response("<svg></svg>", { headers: { "Content-Type": "image/svg+xml" } }),
    new Response("", { headers: { "Content-Type": "image/jpeg" } }),
    new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/jpeg", "Content-Length": "99999999" } }),
    new Response(new Uint8Array(4_194_305), { headers: { "Content-Type": "image/jpeg" } }),
  ])("rejects unsafe, empty or oversized photo responses", async response => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(readClientReferencePhoto("side", assetId, new AbortController().signal, fetcher)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("keeps the Legacy grid/card structure and private request lifecycle without new backend assumptions", () => {
    const source = readFileSync("src/features/training/client/client-reference-panel.tsx", "utf8");
    const css = readFileSync("src/features/training/client/client-reference-panel.module.css", "utf8");
    expect(source).toContain("const REQUEST_TIMEOUT = 8_000");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("URL.revokeObjectURL(objectUrl)");
    expect(source).toContain('window.location.assign("/client-login")');
    expect(source).not.toMatch(/service_role|SUPABASE_|localStorage|\/api\/v1\/coach|\.rpc\(/);
    expect(css).toContain("grid-template-columns: 1fr 1fr");
    expect(css).toContain("background: #111");
    expect(css).toContain("width: 7px; height: 7px");
    expect(css).toContain('"FE Display"');
    expect(css).toContain('"FE Sans", "DM Sans"');
    expect(css).toContain("@media (max-width: 759px)");
    expect(css).toContain(".measurementRow small, .state, .referenceLink { font-size: 13px; }");
  });
});
