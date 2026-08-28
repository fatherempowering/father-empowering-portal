import { M1ContractError } from "@/lib/contracts/m1";

export class InvalidOriginError extends M1ContractError {
  constructor() {
    super("FORBIDDEN", "Cross-origin mutation denied", 403);
    this.name = "InvalidOriginError";
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new InvalidOriginError();
  }
}
