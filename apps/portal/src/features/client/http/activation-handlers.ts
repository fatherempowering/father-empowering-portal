import type { ActivationContext } from "../activation/contracts";
import type { ClientActivationWorkflow } from "../activation/client-activation-workflow";
import {
  assertSameOrigin,
  jsonResponse,
  readSmallJsonObject,
  safeHttpError,
} from "./json";

type ContextFactory = (request: Request) => ActivationContext;

export type ActivationHandlerDependencies = Readonly<{
  workflow: ClientActivationWorkflow;
  createContext?: ContextFactory;
}>;

export function createInspectInvitationHandler({
  workflow,
  createContext = defaultContext,
}: ActivationHandlerDependencies) {
  return async function inspectInvitation(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const body = await readSmallJsonObject(request);
      const invitation = await workflow.inspectInvitation(
        body.invitationToken,
        createContext(request),
      );
      return jsonResponse({ invitation });
    } catch (error) {
      return safeHttpError(error);
    }
  };
}

export function createRequestOtpHandler({
  workflow,
  createContext = defaultContext,
}: ActivationHandlerDependencies) {
  return async function requestOtp(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const body = await readSmallJsonObject(request);
      const invitation = await workflow.requestOtp(body.invitationToken, createContext(request));
      return jsonResponse({ invitation }, { status: 202 });
    } catch (error) {
      return safeHttpError(error);
    }
  };
}

export function createVerifyOtpHandler({
  workflow,
  createContext = defaultContext,
}: ActivationHandlerDependencies) {
  return async function verifyOtp(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const body = await readSmallJsonObject(request);
      const client = await workflow.verifyOtpAndActivate(
        {
          invitationToken: body.invitationToken,
          otp: body.otp,
        },
        createContext(request),
      );
      return jsonResponse({ client, redirectTo: "/client" });
    } catch (error) {
      return safeHttpError(error);
    }
  };
}

function defaultContext(request: Request): ActivationContext {
  const forwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown";

  return {
    requestFingerprint: `${forwardedFor ?? "unknown"}:${userAgent}`,
    correlationId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}
