import { z } from "zod";

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Statuses that count as "still open". */
export const OPEN_TASK_STATUSES = ["open", "in_progress"] as const;

export const taskSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().min(1),
  /** Short per-conversation number shown to the user as `#<seq>`. */
  seq: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(4000).nullable(),
  status: taskStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(4000).optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
