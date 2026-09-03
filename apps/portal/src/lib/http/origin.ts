import { M1ContractError } from "@/lib/contracts/m1";

export class InvalidOriginError extends M1ContractError {
  constructor() {
    super("FORBIDDEN", "Cross-origin mutation denied", 403);
    this.name = "InvalidOriginError";
  }
}

function configuredAppOrigin(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredUrl) {
    throw new InvalidOriginError();
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new InvalidOriginError();
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    parsedUrl.origin === "null"
  ) {
    throw new InvalidOriginError();
  }

  return parsedUrl.origin;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expectedOrigin = configuredAppOrigin();

  if (!origin || origin !== expectedOrigin) {
    throw new InvalidOriginError();
  }
}
