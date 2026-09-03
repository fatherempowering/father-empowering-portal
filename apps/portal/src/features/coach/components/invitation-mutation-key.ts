export type InvitationMutationAction = "resend" | "revoke";

export function invitationMutationKey(
  action: InvitationMutationAction,
  clientId: string,
  invitationId: string,
): string {
  return `${action}:${clientId}:${invitationId}`;
}
