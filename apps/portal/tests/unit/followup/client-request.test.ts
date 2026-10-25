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
  it.each([401, 403])("cancels a stale read before a late %i can redirect", async status => {
    const lifecycle = new AbortController(), replace = vi.fn();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("window", { location: { replace } }); vi.stubGlobal("fetch", fetcher);
    const outcome = expect(followupRequest("/api/v1/client/nutrition", value => value, undefined, lifecycle.signal)).rejects.toMatchObject({ status: "CANCELLED" });
    lifecycle.abort();
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    finish(new Response("{}", { status })); await outcome;
    expect(replace).not.toHaveBeenCalled();
  });
  it("does not abort a write transport but rejects its old-cycle confirmation", async () => {
    const lifecycle = new AbortController(), parse = vi.fn(value => value);
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
    const command = { action: "save", clientMutationId: "same-command" };
    const outcome = expect(followupRequest("/api/v1/client/check-ins", parse, command, lifecycle.signal)).rejects.toMatchObject({ status: "CANCELLED" });
    lifecycle.abort();
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(false);
    finish(new Response(JSON.stringify({ data: { saved: true } }))); await outcome;
    expect(parse).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not accept a body that finishes after its page lifecycle ended", async () => {
    const lifecycle = new AbortController(), parse = vi.fn(value => value);
    let finish!: (value: unknown) => void;
    const json = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
    const outcome = expect(followupRequest("/api/v1/client/progression", parse, undefined, lifecycle.signal)).rejects.toMatchObject({ status: "CANCELLED" });
    await Promise.resolve(); lifecycle.abort(); finish({ data: { total: 2 } }); await outcome;
    expect(parse).not.toHaveBeenCalled();
  });
});
