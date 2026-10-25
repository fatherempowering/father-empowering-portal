import { describe, expect, it } from "vitest";
import { newProgram, newSession } from "@/lib/training/program-editor";
import type { ProgramPublication } from "@/lib/contracts/training-publication";
import { programSelectionQuery, readProgramSelection, resolveProgramSelection } from "@/lib/training/program-navigation";

const id = "19200000-0000-4000-8000-000000000001";
function fixture(): ProgramPublication {
  const document = newProgram();
  const first = newSession();
  first.id = "19200000-0000-4000-8000-00000000abcd";
  const second = newSession();
  second.id = "19200000-0000-4000-8000-00000000abce";
  document.weeks[0].sessions = [first];
  document.weeks.push({ number: 2, objective: { fr: "", en: "" }, sessions: [structuredClone(first), second] });
  return { id, clientId: id, programId: id, draftVersion: 1, revision: 1, publishedAt: "2026-10-25T00:00:00Z", document };
}

describe("published week and day navigation", () => {
  it("selects only real published sessions, with no invented dates or locked weeks", () => {
    const program = fixture();
    const { week, session } = resolveProgramSelection(program, null);
    expect(week.number).toBe(1);
    expect(session).toBe(program.document.weeks[0].sessions[0]);
    expect(session.schedule).toEqual({ mode: "flexible", day: null });
  });
  it("restores the exact publication/week/session and supports mixed-case UUIDs", () => {
    const program = fixture();
    const query = programSelectionQuery(id, 2, program.document.weeks[1].sessions[1].id.toUpperCase());
    const restored = resolveProgramSelection(program, readProgramSelection(query));
    expect(restored.week.number).toBe(2);
    expect(restored.session).toBe(program.document.weeks[1].sessions[1]);
  });
  it("does not carry an old publication bookmark into its replacement", () => {
    const program = fixture();
    const request = readProgramSelection(programSelectionQuery("old-publication", 2, program.document.weeks[1].sessions[1].id));
    expect(resolveProgramSelection(program, request).week.number).toBe(1);
  });
  it.each(["-1", "0", "53", "Infinity", "1e1", "1.5", "garbage", "99999999999999999"])("rejects invalid week %s", (week) => {
    expect(readProgramSelection(new URLSearchParams({ weekNumber: week })).weekNumber).toBeNull();
  });
  it("falls back to a real session when a bookmark is missing or invalid", () => {
    const program = fixture();
    const resolved = resolveProgramSelection(program, { publicationId: id, weekNumber: 2, sessionId: "missing" });
    expect(resolved.session).toBe(program.document.weeks[1].sessions[0]);
  });
  it("does not mutate publications or fabricate sessions in an empty week", () => {
    const program = fixture();
    program.document.weeks[1].sessions = [];
    const before = structuredClone(program);
    expect(resolveProgramSelection(program, { publicationId: id, weekNumber: 2, sessionId: null }).session).toBeUndefined();
    expect(program).toEqual(before);
  });
});
