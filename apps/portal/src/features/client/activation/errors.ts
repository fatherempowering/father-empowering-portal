export type ClientActivationErrorCode =
  | "INVALID_INPUT"
  | "INVITATION_UNAVAILABLE"
  | "OTP_REJECTED"
  | "RATE_LIMITED";

export class ClientActivationError extends Error {
  readonly code: ClientActivationErrorCode;

  constructor(code: ClientActivationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClientActivationError";
    this.code = code;
  }
}

export function isClientActivationError(error: unknown): error is ClientActivationError {
  return error instanceof ClientActivationError;
}
