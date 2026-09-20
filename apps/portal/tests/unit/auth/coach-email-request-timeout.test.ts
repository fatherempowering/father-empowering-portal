import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: "a" }));

import {
  CoachAuthRequestTimeoutError,
  fetchCoachAuthWithTimeout,
} from "@/features/coach/auth/coach-email-verification-card";

describe("Coach email verification request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a suspended request and clears its timer", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const transport = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        capturedSignal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => {
          capturedSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );

    const pending = fetchCoachAuthWithTimeout(
      "/api/v1/auth/coach-email-otp/request",
      { method: "POST" },
      250,
      transport as typeof fetch,
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      CoachAuthRequestTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(250);
    await assertion;

    expect(capturedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timeout after a normal response", async () => {
    vi.useFakeTimers();
    const response = new Response(null, { status: 202 });
    const transport = vi.fn().mockResolvedValue(response);

    await expect(
      fetchCoachAuthWithTimeout(
        "/api/v1/auth/coach-email-otp/request",
        { method: "POST" },
        250,
        transport,
      ),
    ).resolves.toBe(response);

    expect(vi.getTimerCount()).toBe(0);
  });
});
