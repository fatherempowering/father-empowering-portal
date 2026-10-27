import { z } from "zod";
import { uuidSchema } from "./m1";
import { programEditorSchema } from "./training-drafts";
import { trainingProgramDraftSchema } from "./training";

// Editing permits incomplete plans. Publication does not.
export const publishableProgramSchema = programEditorSchema.superRefine((program, ctx) => {
  if (!trainingProgramDraftSchema.safeParse(program).success || program.weeks.some((week) =>
    week.sessions.some((session) => !session.title.fr && !session.title.en))) {
    ctx.addIssue({ code: "custom", message: "Complete every week, session and exercise group before publishing" });
  }
});
export const publishProgramRequestSchema = z.object({
  clientId: uuidSchema,
  programId: uuidSchema,
  draftVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expectedPublicationId: uuidSchema.nullable(),
  clientMutationId: uuidSchema,
}).strict();
export type PublishProgramRequest = z.infer<typeof publishProgramRequestSchema>;
export const publicationSchema = z.object({
  id: uuidSchema, clientId: uuidSchema, programId: uuidSchema,
  draftVersion: z.number().int().positive(), revision: z.number().int().positive(),
  document: publishableProgramSchema, publishedAt: z.string().datetime({ offset: true }),
}).strict();
export type ProgramPublication = z.infer<typeof publicationSchema>;
export const publicationResponseSchema = z.object({ program: publicationSchema.nullable() }).strict();
export const publicationClientsSchema = z.object({
  clients: z.array(z.object({ id: uuidSchema, name: z.string().min(1).max(241), isOwnProfile: z.boolean().optional() }).strict()).max(20),
  total: z.number().int().nonnegative(), page: z.number().int().nonnegative(),
}).strict();
export type PublicationClients = z.infer<typeof publicationClientsSchema>;
