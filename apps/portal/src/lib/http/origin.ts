export class InvalidOriginError extends Error {
  constructor() {
    super("Cross-origin mutation denied");
    this.name = "InvalidOriginError";
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new InvalidOriginError();
  }
}
