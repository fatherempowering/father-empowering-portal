import { describe, expect, it, vi } from "vitest";

import { readM1JsonObject } from "@/lib/http/json-body";

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
