import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActivationAuditPort,
  ActivationRateLimitPort,
  ClientInvitationPort,
  ClientOtpPort,
  InvitationRecord,
} from "./contracts";
import { ClientActivationWorkflow } from "./client-activation-workflow";

const NOW = new Date("2026-08-27T15:00:00.000Z");
const TOKEN = "a_secure_opaque_invitation_token_1234567890";

describe("ClientActivationWorkflow", () => {
  let invitation: InvitationRecord;
  let invitations: ClientInvitationPort;
  let otp: ClientOtpPort;
  let limiter: ActivationRateLimitPort;
  let audit: ActivationAuditPort;

  beforeEach(() => {
    invitation = {
      id: "invitation-1",
      emailHint: "cl••••@example.com",
      expiresAt: new Date("2026-08-28T15:00:00.000Z"),
      locale: "fr-CA",
    };
    invitations = {
      findUsableByOpaqueToken: vi.fn().mockResolvedValue(invitation),
      acceptAtomically: vi.fn().mockResolvedValue({
        clientId: "client-1",
        organizationId: "organization-1",
        membershipId: "membership-1",
        assignmentId: "assignment-1",
        status: "ACTIVE",
      }),
    };
    otp = {
      sendInvitationOtp: vi.fn().mockResolvedValue(undefined),
      verifyInvitationOtp: vi.fn().mockResolvedValue({
        authUserId: "auth-user-1",
      }),
    };
    limiter = { consume: vi.fn().mockResolvedValue(undefined) };
    audit = { append: vi.fn().mockResolvedValue(undefined) };
  });

  function workflow() {
    return new ClientActivationWorkflow({
      invitations,
      otp,
      limiter,
      audit,
      clock: () => NOW,
    });
  }

  const context = {
    requestFingerprint: "request-key",
    correlationId: "correlation-1",
  };

  it("returns only a masked invitation email", async () => {
    const result = await workflow().inspectInvitation(TOKEN, context);

    expect(result).toEqual({
      emailHint: "cl••••@example.com",
      expiresAt: invitation.expiresAt.toISOString(),
      locale: "fr-CA",
    });
    expect(JSON.stringify(result)).not.toContain("client@example.com");
  });

  it("sends OTP by opaque invitation token and accepts no caller email", async () => {
    await workflow().requestOtp(TOKEN, context);

    expect(otp.sendInvitationOtp).toHaveBeenCalledWith({
      opaqueToken: TOKEN,
      correlationId: context.correlationId,
    });
    expect(limiter.consume).toHaveBeenCalledWith({
      kind: "REQUEST_OTP",
      invitationId: invitation.id,
      requestFingerprint: context.requestFingerprint,
    });
  });

  it("verifies OTP before atomically activating the invited client", async () => {
    const result = await workflow().verifyOtpAndActivate(
      { invitationToken: TOKEN, otp: "123456" },
      context,
    );

    expect(otp.verifyInvitationOtp).toHaveBeenCalledWith({
      opaqueToken: TOKEN,
      token: "123456",
      correlationId: context.correlationId,
    });
    expect(invitations.acceptAtomically).toHaveBeenCalledWith({
      opaqueToken: TOKEN,
      authUserId: "auth-user-1",
      correlationId: context.correlationId,
    });
    expect(result.status).toBe("ACTIVE");
  });

  it("does not verify or activate an expired invitation", async () => {
    invitation = { ...invitation, expiresAt: NOW };
    vi.mocked(invitations.findUsableByOpaqueToken).mockResolvedValue(invitation);

    await expect(
      workflow().verifyOtpAndActivate(
        { invitationToken: TOKEN, otp: "123456" },
        context,
      ),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(otp.verifyInvitationOtp).not.toHaveBeenCalled();
    expect(invitations.acceptAtomically).not.toHaveBeenCalled();
  });

  it("does not activate when the OTP provider rejects the code", async () => {
    vi.mocked(otp.verifyInvitationOtp).mockRejectedValue(new Error("invalid OTP"));

    await expect(
      workflow().verifyOtpAndActivate(
        { invitationToken: TOKEN, otp: "123456" },
        context,
      ),
    ).rejects.toMatchObject({ code: "OTP_REJECTED" });
    expect(invitations.acceptAtomically).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens before accessing storage", async () => {
    await expect(workflow().requestOtp("short", context)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(invitations.findUsableByOpaqueToken).not.toHaveBeenCalled();
  });

  it("normalizes spaces in a six-digit OTP", async () => {
    await workflow().verifyOtpAndActivate(
      { invitationToken: TOKEN, otp: "123 456" },
      context,
    );

    expect(otp.verifyInvitationOtp).toHaveBeenCalledWith(
      expect.objectContaining({ token: "123456" }),
    );
  });
});
