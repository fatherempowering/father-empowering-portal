export const CLIENT_ROLE = "CLIENT" as const;

export type ClientRole = typeof CLIENT_ROLE;

export type InvitationRecord = Readonly<{
  id: string;
  emailHint: string;
  expiresAt: Date;
  locale: "en-CA" | "fr-CA";
}>;

export type PublicInvitation = Readonly<{
  emailHint: string;
  expiresAt: string;
  locale: "en-CA" | "fr-CA";
}>;

export type AuthenticatedIdentity = Readonly<{
  authUserId: string;
}>;

export type ActivatedClient = Readonly<{
  clientId: string;
  organizationId: string;
  membershipId: string;
  assignmentId: string;
  status: "ACTIVE";
}>;

export type ActivationContext = Readonly<{
  /** A server-derived, non-secret key used only for rate limiting. */
  requestFingerprint: string;
  correlationId: string;
}>;

export type ActivationAttempt = Readonly<{
  kind: "REQUEST_OTP" | "VERIFY_OTP";
  invitationId: string;
  requestFingerprint: string;
}>;

export interface ClientInvitationPort {
  /**
   * Resolves a high-entropy opaque token without persisting or logging the raw
   * value. The adapter is responsible for hashing it before querying storage.
   */
  findUsableByOpaqueToken(token: string, now: Date): Promise<InvitationRecord | null>;

  /**
   * Atomically marks the invitation accepted, links the auth identity to the
   * client, upserts the CLIENT profile/membership, activates the client and
   * appends the M1 audit event. A stale/replayed invitation must be rejected.
   */
  acceptAtomically(input: {
    opaqueToken: string;
    correlationId: string;
  }): Promise<ActivatedClient>;
}

export interface ClientOtpPort {
  /** Sends an OTP to the invitation-owned email resolved in server-only code. */
  sendInvitationOtp(input: {
    opaqueToken: string;
    correlationId: string;
  }): Promise<void>;

  /**
   * Resolves the invitation-owned email in server-only code, verifies its OTP
   * and establishes the authenticated server session.
   */
  verifyInvitationOtp(input: {
    opaqueToken: string;
    token: string;
    correlationId: string;
  }): Promise<AuthenticatedIdentity>;
}

export interface ActivationRateLimitPort {
  consume(attempt: ActivationAttempt): Promise<void>;
}

export interface ActivationAuditPort {
  append(input: {
    action: "CLIENT_INVITATION_VIEWED" | "CLIENT_OTP_REQUESTED";
    invitationId: string;
    correlationId: string;
    occurredAt: Date;
  }): Promise<void>;
}

export type ClientActivationDependencies = Readonly<{
  invitations: ClientInvitationPort;
  otp: ClientOtpPort;
  limiter: ActivationRateLimitPort;
  audit: ActivationAuditPort;
  clock: () => Date;
}>;
