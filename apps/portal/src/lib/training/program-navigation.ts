import type { ProgramPublication } from "@/lib/contracts/training-publication";

export type ProgramSelection = {
  publicationId: string | null;
  weekNumber: number | null;
  sessionId: string | null;
};

export function readProgramSelection(query: URLSearchParams): ProgramSelection {
  const value = query.get("weekNumber");
  const number = value && /^\d+$/.test(value) ? Number(value) : null;
  return {
    publicationId: query.get("publicationId"),
    weekNumber: number !== null && Number.isSafeInteger(number) && number >= 1 && number <= 52 ? number : null,
    sessionId: query.get("sessionId"),
  };
}

export function resolveProgramSelection(program: ProgramPublication, requested: ProgramSelection | null) {
  // Selection is scoped to a publication: an old bookmark cannot select a
  // similarly named session in a replacement program.
  const samePublication = requested?.publicationId?.toLowerCase() === program.id.toLowerCase();
  const week = (samePublication
    ? program.document.weeks.find((item) => item.number === requested?.weekNumber)
    : null) ?? program.document.weeks[0];
  const session = (samePublication
    ? week?.sessions.find((item) => item.id.toLowerCase() === requested?.sessionId?.toLowerCase())
    : null) ?? week?.sessions[0];
  return { week, session };
}

export function programSelectionQuery(publicationId: string, weekNumber: number, sessionId?: string) {
  const query = new URLSearchParams({ publicationId, weekNumber: String(weekNumber) });
  if (sessionId) query.set("sessionId", sessionId);
  return query;
}
