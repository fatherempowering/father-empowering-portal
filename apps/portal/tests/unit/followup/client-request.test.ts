import { afterEach, describe, expect, it, vi } from "vitest";
import { followupRequest } from "@/features/followup/client/followup-http";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Client followup request boundaries", () => {
  it("uses no-store reads and parses only data", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { total: 2 } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await followupRequest("/api/v1/client/check-ins", value => value)).toEqual({ total: 2 });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/client/check-ins", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it.each([401, 403])("redirects invalid authorization %i to Client Auth", async status => {
    const replace = vi.fn(); vi.stubGlobal("window", { location: { replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(followupRequest("/api/v1/client/check-ins", value => value)).rejects.toMatchObject({ status });
    expect(replace).toHaveBeenCalledExactlyOnceWith("/client-login");
  });
  it("keeps malformed or rejected schemas fail-closed without raw response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: "private server content" }))));
    await expect(followupRequest("/api/v1/client/progression", () => { throw new Error("private parser context"); })).rejects.toMatchObject({ message: "RESPONSE", status: "RESPONSE" });
  });
  it("bounds a stalled request to twelve seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const outcome = expect(followupRequest("/api/v1/client/nutrition", value => value)).rejects.toMatchObject({ status: "NETWORK" });
    await vi.advanceTimersByTimeAsync(12000); await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("submits a supplied idempotent command unchanged without leaking exception details", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private transport details")); vi.stubGlobal("fetch", fetcher);
    const command = { action: "submit", expectedVersion: 4, clientMutationId: "test-id" };
    await expect(followupRequest("/api/v1/client/check-ins", value => value, command)).rejects.toMatchObject({ status: "NETWORK", message: "NETWORK" });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify(command), headers: { "content-type": "application/json" } });
  });
});
