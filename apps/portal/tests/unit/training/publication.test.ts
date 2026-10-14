import { describe, expect, it } from "vitest";
import { newProgram, newSession, newBlock } from "@/lib/training/program-editor";
import { publishableProgramSchema, publishProgramRequestSchema } from "@/lib/contracts/training-publication";
const id = "19100000-0000-4000-8000-000000000001";
describe("publication contract", () => {
  it("does not publish an empty week or a training session without exercises", () => {
    const doc = newProgram(); expect(publishableProgramSchema.safeParse(doc).success).toBe(false);
    doc.weeks[0].sessions.push(newSession()); expect(publishableProgramSchema.safeParse(doc).success).toBe(false);
    doc.weeks[0].sessions[0].blocks.push(newBlock()); expect(publishableProgramSchema.safeParse(doc).success).toBe(false);
  });
  it("permits explicitly prescribed rest but refuses unnamed sessions", () => {
    const doc = newProgram(); const session = newSession(); session.type = "complete-rest"; doc.weeks[0].sessions.push(session);
    expect(publishableProgramSchema.safeParse(doc).success).toBe(true);
    session.title = { fr: "", en: "" }; expect(publishableProgramSchema.safeParse(doc).success).toBe(false);
  });
  const command = { clientId: id, programId: id, draftVersion: 1, expectedPublicationId: null, clientMutationId: id };
  it("requires explicit target, draft version and previous publication", () => {
    expect(publishProgramRequestSchema.safeParse(command).success).toBe(true);
    expect(publishProgramRequestSchema.safeParse({ ...command, draftVersion: 0 }).success).toBe(false);
    expect(publishProgramRequestSchema.safeParse({ ...command, expectedPublicationId: undefined }).success).toBe(false);
    expect(publishProgramRequestSchema.safeParse({ ...command, organizationId: id }).success).toBe(false);
    expect(publishProgramRequestSchema.safeParse({ ...command, document: newProgram() }).success).toBe(false);
  });
});
