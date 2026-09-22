import { describe, expect, it, vi } from "vitest";

import { readJsonObjectWithLimit, readM1JsonObject } from "@/lib/http/json-body";

describe("bounded M1 JSON reader", () => {
  it("cancels a chunked stream immediately after the 4 KiB limit", async () => {
    const encoder = new TextEncoder();
    const cancelled = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode("x".repeat(3_000)));
        if (pulls >= 10) controller.close();
      },
      cancel: cancelled,
    });
    const request = {
      body,
      headers: new Headers({ "content-type": "application/json" }),
    } as Request;

    await expect(readM1JsonObject(request)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "Request body is too large",
      status: 400,
    });

    expect(cancelled).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThan(10);
  });
});

describe("configurable bounded JSON reader", () => {
  it("accepts an assessment body under its dedicated cap", async () => {
    const value = { notes: "x".repeat(5_000) };
    const request = new Request("http://127.0.0.1/api", {
      method: "PUT",
      body: JSON.stringify(value),
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonObjectWithLimit(request, 32_768)).resolves.toEqual(value);
  });

  it("fails closed on a dishonest chunked body over the configured cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(33_000)));
        controller.close();
      },
    });
    const request = {
      body,
      headers: new Headers({ "content-type": "application/json" }),
    } as Request;

    await expect(readJsonObjectWithLimit(request, 32_768)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 400,
    });
  });
});
