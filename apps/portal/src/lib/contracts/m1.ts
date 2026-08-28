import { z } from "zod";

export const M1_ROLES = ["ADMIN", "COACH", "CLIENT"] as const;
export const m1RoleSchema = z.enum(M1_ROLES);
export type M1Role = z.infer<typeof m1RoleSchema>;

export const MEMBERSHIP_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const CLIENT_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const clientStatusSchema = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const ASSIGNMENT_STATUSES = ["PENDING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

export const INVITATION_STATUSES = ["PENDING", "SENT", "ACCEPTED", "EXPIRED", "REVOKED"] as const;
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const shortTextSchema = z.string().trim().min(1).max(120);
export const localeSchema = z.enum(["fr-CA", "en-CA"]);
export const timeZoneSchema = z.string().trim().min(1).max(100);

export const serverActorSchema = z.object({
  userId: uuidSchema,
  organizationId: uuidSchema,
  membershipId: uuidSchema,
  clientId: uuidSchema.nullable(),
  role: m1RoleSchema,
  aal: z.enum(["aal1", "aal2"]),
});
export type ServerActor = z.infer<typeof serverActorSchema>;

export const createClientInputSchema = z.object({
  idempotencyKey: uuidSchema,
  email: emailSchema,
  firstName: shortTextSchema,
  lastName: shortTextSchema,
  locale: localeSchema.default("fr-CA"),
  timeZone: timeZoneSchema.default("America/Montreal"),
});
export type CreateClientInput = z.input<typeof createClientInputSchema>;

export const clientSummarySchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  firstName: shortTextSchema,
  lastName: shortTextSchema,
  locale: localeSchema,
  timeZone: timeZoneSchema,
  status: clientStatusSchema,
  assignmentStatus: assignmentStatusSchema,
  primaryCoachId: uuidSchema,
  authUserId: uuidSchema.nullable(),
});
export type CreatedClientSummary = z.infer<typeof clientSummarySchema>;

// Shared feature-facing M1 contracts. The database keeps canonical fr-CA/en-CA
// locales; Coach forms use the intentionally smaller fr/en presentation type.
export type ActorContext = ServerActor;

export interface CreateClientRequest {
  firstName: string;
  lastName: string;
  email: string;
  locale: "fr" | "en";
  timezone: string;
}

export interface ClientSummary {
  id: string;
  organizationId: string;
  authUserId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  displayName: string;
  email: string;
  locale: "fr" | "en";
  timezone: string;
  plannedStartDate: string | null;
  status: ClientStatus;
  primaryCoachUserId: string;
  createdAt: string;
}

export interface InvitationSummary {
  id: string;
  clientId: string;
  email: string;
  status: "PENDING" | "SENT" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
}

export const createClientResultSchema = z.object({
  client: clientSummarySchema,
  invitationId: uuidSchema,
});
export type CreateClientResult = z.infer<typeof createClientResultSchema>;

export const invitationOtpContextSchema = z.object({
  invitationId: uuidSchema,
  email: emailSchema,
  emailHint: z.string().min(3).max(320),
  expiresAt: z.string().datetime({ offset: true }),
});
export type InvitationOtpContext = z.infer<typeof invitationOtpContextSchema>;

export const sendClientInvitationInputSchema = z.object({
  clientId: uuidSchema,
});
export type SendClientInvitationInput = z.infer<typeof sendClientInvitationInputSchema>;

export const sendClientInvitationResultSchema = z.object({
  invitationId: uuidSchema,
  expiresAt: z.string().datetime({ offset: true }),
});
export type SendClientInvitationResult = z.infer<typeof sendClientInvitationResultSchema>;

export const acceptClientInvitationInputSchema = z.object({
  invitationToken: z.string().trim().min(32).max(512),
});
export type AcceptClientInvitationInput = z.infer<typeof acceptClientInvitationInputSchema>;

export const acceptClientInvitationResultSchema = z.object({
  clientId: uuidSchema,
  organizationId: uuidSchema,
  membershipId: uuidSchema,
  assignmentId: uuidSchema,
  status: z.literal("ACTIVE"),
});
export type AcceptClientInvitationResult = z.infer<typeof acceptClientInvitationResultSchema>;

export const m1ErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_STATE",
  "VALIDATION_FAILED",
  "VERSION_CONFLICT",
  "DUPLICATE",
  "RATE_LIMITED",
  "TEMPORARILY_UNAVAILABLE",
]);
export type M1ErrorCode = z.infer<typeof m1ErrorCodeSchema>;

export class M1ContractError extends Error {
  readonly code: M1ErrorCode;
  readonly status: number;

  constructor(code: M1ErrorCode, message: string, status: number) {
    super(message);
    this.name = "M1ContractError";
    this.code = code;
    this.status = status;
  }
}
