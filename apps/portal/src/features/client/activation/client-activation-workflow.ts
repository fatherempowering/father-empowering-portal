import type {
  ActivatedClient,
  ActivationContext,
  ClientActivationDependencies,
  InvitationRecord,
  PublicInvitation,
} from "./contracts";
import { ClientActivationError } from "./errors";
import { parseOpaqueInvitationToken, parseOtp } from "./validation";

export class ClientActivationWorkflow {
  constructor(private readonly dependencies: ClientActivationDependencies) {}

  async inspectInvitation(
    rawToken: unknown,
    context: ActivationContext,
  ): Promise<PublicInvitation> {
    const token = parseOpaqueInvitationToken(rawToken);
    const now = this.dependencies.clock();
    const invitation = await this.findUsableInvitation(token, now);

    await this.dependencies.audit.append({
      action: "CLIENT_INVITATION_VIEWED",
      invitationId: invitation.id,
      correlationId: context.correlationId,
      occurredAt: now,
    });

    return toPublicInvitation(invitation);
  }

  async requestOtp(
    rawToken: unknown,
    context: ActivationContext,
  ): Promise<PublicInvitation> {
    const token = parseOpaqueInvitationToken(rawToken);
    const now = this.dependencies.clock();
    const invitation = await this.findUsableInvitation(token, now);

    await this.dependencies.limiter.consume({
      kind: "REQUEST_OTP",
      invitationId: invitation.id,
      requestFingerprint: context.requestFingerprint,
    });

    // The caller never supplies an email. This is the central guard against
    // turning the invitation endpoint into a public account-creation surface.
    await this.dependencies.otp.sendInvitationOtp({
      opaqueToken: token,
      correlationId: context.correlationId,
    });

    await this.dependencies.audit.append({
      action: "CLIENT_OTP_REQUESTED",
      invitationId: invitation.id,
      correlationId: context.correlationId,
      occurredAt: now,
    });

    return toPublicInvitation(invitation);
  }

  async verifyOtpAndActivate(
    input: { invitationToken: unknown; otp: unknown },
    context: ActivationContext,
  ): Promise<ActivatedClient> {
    const invitationToken = parseOpaqueInvitationToken(input.invitationToken);
    const otp = parseOtp(input.otp);
    const now = this.dependencies.clock();
    const invitation = await this.findUsableInvitation(invitationToken, now);

    await this.dependencies.limiter.consume({
      kind: "VERIFY_OTP",
      invitationId: invitation.id,
      requestFingerprint: context.requestFingerprint,
    });

    try {
      await this.dependencies.otp.verifyInvitationOtp({
        opaqueToken: invitationToken,
        token: otp,
        correlationId: context.correlationId,
      });
    } catch (cause) {
      throw new ClientActivationError("OTP_REJECTED", "The code is invalid or expired.", {
        cause,
      });
    }

    return this.dependencies.invitations.acceptAtomically({
      opaqueToken: invitationToken,
      correlationId: context.correlationId,
    });
  }

  private async findUsableInvitation(token: string, now: Date): Promise<InvitationRecord> {
    const invitation = await this.dependencies.invitations.findUsableByOpaqueToken(token, now);

    if (!invitation || invitation.expiresAt.getTime() <= now.getTime()) {
      // Deliberately collapses missing, expired, revoked and consumed invitations.
      throw new ClientActivationError(
        "INVITATION_UNAVAILABLE",
        "The invitation is invalid, expired, or has already been used.",
      );
    }

    return invitation;
  }
}

function toPublicInvitation(invitation: InvitationRecord): PublicInvitation {
  return {
    emailHint: invitation.emailHint,
    expiresAt: invitation.expiresAt.toISOString(),
    locale: invitation.locale,
  };
}
