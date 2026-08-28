import { describe, expect, it } from "vitest";

import { hashInvitationToken } from "@/lib/auth/invitation-token";

describe("invitation token hashing", () => {
  it("creates a deterministic SHA-256 digest without preserving the token", () => {
    const token = "opaque-invitation-token-that-is-long-enough";
    const digest = hashInvitationToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(digest);
  });

  it("rejects tokens too short to provide useful entropy", () => {
    expect(() => hashInvitationToken("short")).toThrow("Invalid invitation token");
  });
});
