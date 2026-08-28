import type {
  CreateClientFormValues,
  InvitationMutationRequest,
} from "./model";

export class CoachInputError extends Error {
  readonly status = 400;
  readonly code = "VALIDATION_FAILED";

  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "CoachInputError";
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectValue(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CoachInputError("Le corps de la requête est invalide.", {
      body: "Un objet JSON est requis.",
    });
  }

  return input as Record<string, unknown>;
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-CA", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function parseClientMutationId(input: unknown): string {
  const value = compactText(input);
  if (value.length < 8 || value.length > 128) {
    throw new CoachInputError("La clé d’idempotence est invalide.", {
      clientMutationId: "Entre 8 et 128 caractères sont requis.",
    });
  }

  return value;
}

export function parseClientId(input: string): string {
  if (!UUID.test(input)) {
    throw new CoachInputError("Le client est invalide.", {
      clientId: "Un UUID valide est requis.",
    });
  }

  return input.toLowerCase();
}

export function parseCreateClientForm(input: unknown): CreateClientFormValues & {
  clientMutationId: string;
} {
  const value = objectValue(input);
  const firstName = compactText(value.firstName);
  const lastName = compactText(value.lastName);
  const email = compactText(value.email).toLowerCase();
  const locale = value.locale;
  const timezone = compactText(value.timezone);
  const fields: Record<string, string> = {};

  if (firstName.length < 1 || firstName.length > 80) {
    fields.firstName = "Le prénom doit contenir entre 1 et 80 caractères.";
  }
  if (lastName.length < 1 || lastName.length > 80) {
    fields.lastName = "Le nom doit contenir entre 1 et 80 caractères.";
  }
  if (email.length > 254 || !EMAIL.test(email)) {
    fields.email = "Une adresse courriel valide est requise.";
  }
  if (locale !== "fr" && locale !== "en") {
    fields.locale = "La langue doit être fr ou en.";
  }
  if (!timezone || !validTimezone(timezone)) {
    fields.timezone = "Un fuseau horaire IANA valide est requis.";
  }

  let clientMutationId = "";
  try {
    clientMutationId = parseClientMutationId(value.clientMutationId);
  } catch (error) {
    if (error instanceof CoachInputError) {
      Object.assign(fields, error.fields);
    } else {
      throw error;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new CoachInputError("Certains renseignements doivent être corrigés.", fields);
  }

  return {
    firstName,
    lastName,
    email,
    locale: locale as "fr" | "en",
    timezone,
    clientMutationId,
  };
}

export function parseInvitationMutation(
  clientId: string,
  input: unknown,
): InvitationMutationRequest {
  const value = objectValue(input);
  return {
    clientId: parseClientId(clientId),
    clientMutationId: parseClientMutationId(value.clientMutationId),
  };
}
