import { describe, expect, it, vi } from "vitest";
import { readLatestCheckIn } from "@/features/training/client/latest-checkin-panel";
import { emptyCheckInDocument } from "@/lib/contracts/client-followup";

describe("actual latest submitted check-in in the Training reference panel", () => {
  it("uses only the authenticated own-client route, rejects drafts as a source, and preserves zero", async () => {
    const document = emptyCheckInDocument("2026-10-25");
    document.measurements.bodyWeightLb = 180; document.sleepHours = 0; document.cardioMinutes = 0;
    const submitted = { id: "11111111-1111-4111-8111-111111111111", clientId: "22222222-2222-4222-8222-222222222222", document, submittedAt: "2026-10-25T18:00:00Z" };
    const draft = { version: 3, document: { ...document, sleepHours: 8 }, updatedAt: "2026-10-25T19:00:00Z" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { version: 3, draft, history: [submitted], historyTruncated: false, page: 0, total: 1 } }));
    const signal = new AbortController().signal;
    expect(await readLatestCheckIn(signal, fetcher)).toEqual(submitted);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/client/check-ins?page=0", { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
  });
  it("distinguishes an empty history from a missing or invalid response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: { version: 0, draft: null, history: [], historyTruncated: false, page: 0, total: 0 } })).mockResolvedValueOnce(Response.json({ data: {} }));
    expect(await readLatestCheckIn(new AbortController().signal, fetcher)).toBeNull();
    await expect(readLatestCheckIn(new AbortController().signal, fetcher)).rejects.toBeDefined();
  });
  it.each([401,403,500])("status %i never exposes raw server contents or becomes an empty history", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "PRIVATE_CONTENT" }, { status }));
    await expect(readLatestCheckIn(new AbortController().signal, fetcher)).rejects.toThrow(status === 500 ? "UNAVAILABLE" : "AUTH_REQUIRED");
  });
});
