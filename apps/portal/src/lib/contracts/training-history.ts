import { z } from "zod";
export const programVersionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const programHistorySchema = z.object({
  items: z.array(z.object({ version: programVersionSchema, updatedAt: z.string().datetime({ offset: true }) }).strict()).max(20),
  total: z.number().int().nonnegative(), page: z.number().int().nonnegative(), pageSize: z.literal(20),
}).strict();
export type ProgramHistory = z.infer<typeof programHistorySchema>;
