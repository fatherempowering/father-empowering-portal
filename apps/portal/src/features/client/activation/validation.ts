import { ClientActivationError } from "./errors";

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const OTP_PATTERN = /^\d{6}$/;

export function parseOpaqueInvitationToken(value: unknown): string {
  if (typeof value !== "string" || !OPAQUE_TOKEN_PATTERN.test(value)) {
    throw new ClientActivationError(
      "INVALID_INPUT",
      "The invitation link is invalid.",
    );
  }

  return value;
}

export function parseOtp(value: unknown): string {
  const normalized = typeof value === "string" ? value.replaceAll(/\s/g, "") : "";

  if (!OTP_PATTERN.test(normalized)) {
    throw new ClientActivationError("INVALID_INPUT", "Enter the six-digit code.");
  }

  return normalized;
}
