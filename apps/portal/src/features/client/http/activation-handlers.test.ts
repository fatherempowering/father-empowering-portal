import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientActivationWorkflow } from "../activation/client-activation-workflow";
import {
  createInspectInvitationHandler,
  createRequestOtpHandler,
  createVerifyOtpHandler,
} from "./activation-handlers";

const TOKEN = "a_secure_opaque_invitation_token_1234567890";
const context = {
  requestFingerprint: "test",
  correlationId: "correlation-test",
};

function mockWorkflow() {
  return {
    inspectInvitation: vi.fn().mockResolvedValue({
      emailHint: "cl••••@example.com",
      expiresAt: "2026-08-28T00:00:00.000Z",
      locale: "fr-CA",
    }),
    requestOtp: vi.fn().mockResolvedValue({
      emailHint: "cl••••@example.com",
      expiresAt: "2026-08-28T00:00:00.000Z",
      locale: "fr-CA",
    }),
    verifyOtpAndActivate: vi.fn().mockResolvedValue({
      clientId: "client-1",
      organizationId: "organization-1",
      membershipId: "membership-1",
      assignmentId: "assignment-1",
      status: "ACTIVE",
    }),
  } as unknown as ClientActivationWorkflow;
}

describe("client activation HTTP handlers", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.fatherempowering.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("inspects an opaque token without caching the response", async () => {
    const workflow = mockWorkflow();
    const handler = createInspectInvitationHandler({ workflow, createContext: () => context });

    const response = await handler(
      new Request("https://app.fatherempowering.com/api/v1/client/activation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.fatherempowering.com",
        },
        body: JSON.stringify({ invitationToken: TOKEN }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      invitation: { emailHint: "cl••••@example.com" },
    });
  });

  it("uses the configured canonical origin instead of the internal request URL", async () => {
    const workflow = mockWorkflow();
    const handler = createInspectInvitationHandler({ workflow, createContext: () => context });

    const response = await handler(
      new Request("http://internal-next:3000/api/v1/client/activation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.fatherempowering.com",
        },
        body: JSON.stringify({ invitationToken: TOKEN }),
      }),
    );

    expect(response.status).toBe(200);
    expect(workflow.inspectInvitation).toHaveBeenCalledWith(TOKEN, context);
  });

  it("never accepts an email in the request OTP contract", async () => {
    const workflow = mockWorkflow();
    const handler = createRequestOtpHandler({ workflow, createContext: () => context });
    const request = new Request(
      "https://app.fatherempowering.com/api/v1/client/activation/request-otp",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.fatherempowering.com" },
        body: JSON.stringify({ invitationToken: TOKEN, email: "attacker@example.com" }),
      },
    );

    const response = await handler(request);

    expect(response.status).toBe(202);
    expect(workflow.requestOtp).toHaveBeenCalledWith(TOKEN, context);
  });

  it("rejects cross-origin activation mutations", async () => {
    const workflow = mockWorkflow();
    const handler = createVerifyOtpHandler({ workflow, createContext: () => context });
    const request = new Request(
      "https://app.fatherempowering.com/api/v1/client/activation/verify-otp",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ invitationToken: TOKEN, otp: "123456" }),
      },
    );

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(workflow.verifyOtpAndActivate).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even without Content-Length", async () => {
    const workflow = mockWorkflow();
    const handler = createInspectInvitationHandler({ workflow, createContext: () => context });
    const request = new Request(
      "https://app.fatherempowering.com/api/v1/client/activation",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.fatherempowering.com",
        },
        body: JSON.stringify({ invitationToken: TOKEN, padding: "x".repeat(4_096) }),
      },
    );

    expect(request.headers.get("content-length")).toBeNull();
    const response = await handler(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(workflow.inspectInvitation).not.toHaveBeenCalled();
  });

  it("returns the client route only after OTP verification and atomic activation", async () => {
    const workflow = mockWorkflow();
    const handler = createVerifyOtpHandler({ workflow, createContext: () => context });
    const request = new Request(
      "https://app.fatherempowering.com/api/v1/client/activation/verify-otp",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.fatherempowering.com" },
        body: JSON.stringify({ invitationToken: TOKEN, otp: "123456" }),
      },
    );

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      client: { clientId: "client-1", status: "ACTIVE" },
      redirectTo: "/client",
    });
  });
});
