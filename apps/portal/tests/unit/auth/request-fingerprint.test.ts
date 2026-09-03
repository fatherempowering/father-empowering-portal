import { describe, expect, it } from "vitest";

import { requestFingerprint } from "@/lib/http/request-fingerprint";

describe("public Auth request fingerprint", () => {
  it("uses only the normalized deployment IP and ignores User-Agent rotation", () => {
    const first = new Request("https://app.fatherempowering.com", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.8, 10.0.0.1",
        "user-agent": "attacker-agent-one",
      },
    });
    const rotated = new Request("https://app.fatherempowering.com", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.8, 10.0.0.2",
        "user-agent": "attacker-agent-two",
      },
    });

    expect(requestFingerprint(first)).toBe("203.0.113.8");
    expect(requestFingerprint(rotated)).toBe(requestFingerprint(first));
  });

  it("collapses an absent or forged non-IP header into the conservative bucket", () => {
    expect(requestFingerprint(new Request("https://app.fatherempowering.com"))).toBe("unknown");
    expect(requestFingerprint(new Request("https://app.fatherempowering.com", {
      headers: { "x-vercel-forwarded-for": "forged-value" },
    }))).toBe("unknown");
  });
});
