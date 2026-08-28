import { NextResponse } from "next/server";
import { M1ContractError } from "@/lib/contracts/m1";

import type { CoachActor } from "../model";
import { CoachInputError, parseCreateClientForm, parseInvitationMutation } from "../validation";
import type { CoachM1Service } from "./coach-m1-service";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Readonly<Record<string, string>>;
  };
}

function jsonError(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof M1ContractError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof CoachInputError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
        },
      },
      { status: error.status },
    );
  }

  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "UNAUTHENTICATED") {
    return NextResponse.json(
      { error: { code, message: "Une connexion est requise." } },
      { status: 401 },
    );
  }
  if (code === "FORBIDDEN") {
    return NextResponse.json(
      { error: { code, message: "Tu n’as pas accès à cette action." } },
      { status: 403 },
    );
  }
  if (code === "MFA_REQUIRED") {
    return NextResponse.json(
      { error: { code, message: "La vérification MFA est requise." } },
      { status: 403 },
    );
  }
  if (code === "NOT_FOUND") {
    return NextResponse.json(
      { error: { code, message: "Ce client ou cette invitation est introuvable." } },
      { status: 404 },
    );
  }
  if (code === "INVALID_STATE") {
    return NextResponse.json(
      { error: { code, message: "Cette invitation ne peut plus être modifiée." } },
      { status: 409 },
    );
  }
  if (code === "VERSION_CONFLICT" || code === "DUPLICATE") {
    return NextResponse.json(
      {
        error: {
          code,
          message: "Cette action a déjà été traitée ou entre en conflit avec une action récente.",
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Une erreur est survenue. Réessaie." } },
    { status: 500 },
  );
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CoachInputError("Le corps JSON est invalide.", {
      body: "Un objet JSON valide est requis.",
    });
  }
}

export async function listClientsHttp(
  actor: CoachActor,
  service: CoachM1Service,
): Promise<NextResponse> {
  try {
    return NextResponse.json({ data: await service.listClients(actor) }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createClientHttp(
  request: Request,
  actor: CoachActor,
  service: CoachM1Service,
): Promise<NextResponse> {
  try {
    const input = parseCreateClientForm(await requestJson(request));
    return NextResponse.json(
      { data: await service.createClient(actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function resendInvitationHttp(
  request: Request,
  clientId: string,
  actor: CoachActor,
  service: CoachM1Service,
): Promise<NextResponse> {
  try {
    const input = parseInvitationMutation(clientId, await requestJson(request));
    return NextResponse.json(
      { data: await service.resendInvitation(actor, input) },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function revokeInvitationHttp(
  request: Request,
  clientId: string,
  actor: CoachActor,
  service: CoachM1Service,
): Promise<NextResponse> {
  try {
    const input = parseInvitationMutation(clientId, await requestJson(request));
    return NextResponse.json(
      { data: await service.revokeInvitation(actor, input) },
      { status: 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
